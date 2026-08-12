// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {PonsV2LaunchFactory} from "./PonsV2LaunchFactory.sol";

/**
 * @title PonsV2CashbackRewards
 * @notice Pays holders of a pons v2 launched token a cashback stream funded
 * out of the protocol's own fee share, in whichever approved token each
 * holder chooses to receive it in.
 *
 * @dev Holdings-based, not volume-based: a holder's share of every reward
 * deposit is proportional to how much of the launched token they hold at
 * the moment the deposit lands, using the standard "magnified dividends"
 * accounting (the same technique behind long-running dividend-paying-token
 * designs): each reward deposit for a launched token increments a single
 * per-share accumulator, and a holder's claimable balance is their tracked
 * balance times that accumulator, corrected for every mint/transfer/burn
 * that happened along the way. This makes claiming O(1) regardless of how
 * many deposits happened before it, and lets a holder be paid out lazily
 * without looping over history.
 *
 * The accumulator is duplicated once per reward token a launch has ever
 * been funded in (bounded by MAX_REWARD_TOKENS_PER_LAUNCH), so a holder can
 * hold a claimable balance in several reward tokens at once and pick which
 * one to withdraw, independent of what the protocol most recently deposited.
 * No swap or price oracle is involved anywhere in this contract: a reward
 * token pool only ever pays out what was literally deposited into it.
 *
 * WIRING THIS CONTRACT UP (required, external to this file):
 * 1. This contract only ever learns a holder's true balance two ways:
 *    - `onTokenTransfer`, a push hook the launched token itself must call
 *      on every mint/burn/transfer (exact, real-time, no extra external
 *      calls). Add one line to PonsV2LauncherToken's `_update` override:
 *
 *          (bool ok,) = address(cashback).call(
 *              abi.encodeCall(PonsV2CashbackRewards.onTokenTransfer, (from, to, value))
 *          );
 *          // intentionally ignore `ok` -- a misbehaving or unwired rewards
 *          // contract must never be able to brick token transfers.
 *
 *      Using a raw, result-ignoring call (rather than a direct call or a
 *      try/catch that still bubbles an out-of-gas) is deliberate: token
 *      transfers must keep working even if this contract is paused,
 *      unfunded, or not deployed at all for a given launch.
 *    - `sync`, a permissionless pull fallback anyone can call for any
 *      holder, e.g. to backfill balances predating `enableTracking`, or to
 *      self-heal a token that was never wired with the push hook.
 * 2. The token calls `cashback.enableTracking()` once (typically from its
 *    own constructor) to opt itself in. This is a one-time explicit
 *    step rather than something this contract infers, so a launch that
 *    never wires in cashback costs its holders nothing to check.
 * 3. The protocol grants an `authorizedFunders` role (owner-controlled) to
 *    whatever address actually holds the protocol's fee share -- e.g. a
 *    keeper that periodically pulls the protocol's cut out of the fee
 *    escrow / meme hook and forwards a portion here via `depositReward`.
 *    This contract deliberately does not reach into IPonsV2FeeEscrow or
 *    PonsV2MemeHook itself: it only knows how to receive an ERC-20 amount
 *    it has been given allowance for, which keeps it correct regardless of
 *    exactly how the protocol chooses to account for and release its fee
 *    share upstream.
 */
contract PonsV2CashbackRewards is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Fixed-point scale for the magnified-dividends accumulator. 2**128
    // matches the widely used dividend-paying-token pattern this design is
    // based on: wide enough that per-share precision loss is negligible
    // against any realistic reward-token decimals, while leaving enough
    // headroom below uint256/int256 bounds for realistic supplies and
    // deposit sizes.
    uint256 private constant MAGNITUDE = 2 ** 128;

    // Bounds the loop `_creditCorrections` runs on every tracked balance
    // change (once per active reward token for that launch), so a launch
    // cannot be funded in an unbounded number of distinct reward tokens and
    // turn every future transfer into an unbounded-gas operation.
    uint256 public constant MAX_REWARD_TOKENS_PER_LAUNCH = 12;

    error ZeroAddress();
    error ZeroAmount();
    error TokenNotLaunched();
    error TrackingAlreadyEnabled();
    error TrackingNotEnabled();
    error NotAuthorizedFunder();
    error RewardTokenNotAllowed();
    error NoTrackedHolders();
    error TooManyRewardTokens();
    error NothingToClaim();
    error NoPreferredRewardToken();
    error OwnershipCannotBeRenounced();

    event TrackingEnabled(address indexed token);
    event BalanceSynced(address indexed token, address indexed holder, uint256 oldBalance, uint256 newBalance);
    event AuthorizedFunderUpdated(address indexed funder, bool allowed);
    event ExtraRewardTokenUpdated(address indexed rewardToken, bool allowed);
    event RewardDeposited(address indexed token, address indexed rewardToken, address indexed funder, uint256 amount);
    event RewardClaimed(address indexed token, address indexed rewardToken, address indexed holder, uint256 amount);
    event PreferredRewardTokenSet(address indexed token, address indexed holder, address indexed rewardToken);

    /// @notice The launch factory this contract sources launch validity and
    /// the approved-pair-token allowlist from. Immutable: a cashback
    /// deployment is scoped to exactly one factory's launches for its
    /// entire life.
    PonsV2LaunchFactory public immutable factory;

    /// @notice Whether a launched token has opted itself into balance
    /// tracking. Checked on every `onTokenTransfer` call so the hot path
    /// never has to make an external call back into the factory.
    mapping(address token => bool enabled) public trackingEnabled;

    /// @notice Mirrored balance this contract believes each holder has of a
    /// tracked launched token. Kept exact by `onTokenTransfer` when the
    /// token is wired with the push hook; self-healable at any time via
    /// `sync`.
    mapping(address token => mapping(address holder => uint256 balance)) public trackedBalanceOf;

    /// @notice Sum of every holder balance this contract has ever recorded
    /// for a tracked token. This is the denominator every reward deposit is
    /// divided across, so it only reflects holders who have been synced at
    /// least once (directly, or via the push hook) -- an untracked holder
    /// simply does not participate until they are.
    mapping(address token => uint256 supply) public trackedSupplyOf;

    /// @dev Per-(launch, reward token) magnified accumulator. Incremented on
    /// every `depositReward` by `depositAmount * MAGNITUDE / trackedSupplyOf[token]`.
    mapping(address token => mapping(address rewardToken => uint256 perShare)) public magnifiedRewardPerShare;

    /// @dev Signed correction applied per holder so that a balance change
    /// does not retroactively change what they were owed for deposits that
    /// already happened. See `_creditCorrections`.
    mapping(address token => mapping(address rewardToken => mapping(address holder => int256 correction))) private
        _magnifiedCorrections;

    /// @notice Cumulative amount of a reward token a holder has already
    /// claimed for a launch, so `pendingReward` only ever reports what is
    /// left.
    mapping(address token => mapping(address rewardToken => mapping(address holder => uint256 withdrawn))) public
        withdrawnRewards;

    /// @notice Total ever deposited for a (launch, reward token) pair, for
    /// off-chain accounting and UIs; plays no role in the payout math.
    mapping(address token => mapping(address rewardToken => uint256 total)) public totalRewardsDeposited;

    mapping(address token => mapping(address rewardToken => bool isActive)) public isActiveRewardToken;
    mapping(address token => address[] rewardTokens) private _activeRewardTokensList;

    /// @notice A holder's default reward token for a launch, used by
    /// `claimPreferred`. Purely a UX convenience: `claim` can always target
    /// any reward token the holder has an accrued balance in, regardless of
    /// what is set here.
    mapping(address token => mapping(address holder => address rewardToken)) public preferredRewardToken;

    /// @notice Addresses allowed to fund cashback, e.g. a keeper that
    /// forwards the protocol's fee share pulled from the fee escrow / meme
    /// hook. Owner-managed.
    mapping(address funder => bool allowed) public authorizedFunders;

    /// @notice Reward tokens allowed beyond the factory's own approved pair
    /// tokens. See `isRewardTokenAllowed`.
    mapping(address rewardToken => bool allowed) public extraAllowedRewardTokens;

    constructor(address initialOwner, PonsV2LaunchFactory factory_) Ownable(initialOwner) {
        if (address(factory_) == address(0)) revert ZeroAddress();
        factory = factory_;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice A reward token is claimable if it is one of the factory's own
    /// approved pair tokens, or has been separately whitelisted here. Starts
    /// from the factory's list so every quote asset a launch could actually
    /// have graduated against is usable for cashback out of the box, and is
    /// extensible so the protocol can add reward tokens (e.g. its own
    /// governance token) that were never meant to be a launch's pair asset.
    function isRewardTokenAllowed(address rewardToken) public view returns (bool) {
        return factory.approvedPairTokens(rewardToken) || extraAllowedRewardTokens[rewardToken];
    }

    /// @notice The full list of reward tokens a launch has ever been funded
    /// in, i.e. every token `claim` could possibly pay out for it.
    function activeRewardTokens(address token) external view returns (address[] memory) {
        return _activeRewardTokensList[token];
    }

    /// @notice The amount of `rewardToken` `holder` could withdraw right now
    /// for `token`, given their currently tracked balance.
    function pendingReward(address token, address rewardToken, address holder) public view returns (uint256) {
        uint256 accumulated = _accumulativeOf(token, rewardToken, holder);
        uint256 withdrawn = withdrawnRewards[token][rewardToken][holder];
        return accumulated > withdrawn ? accumulated - withdrawn : 0;
    }

    function _accumulativeOf(address token, address rewardToken, address holder) private view returns (uint256) {
        uint256 product = magnifiedRewardPerShare[token][rewardToken] * trackedBalanceOf[token][holder];
        int256 magnified = SafeCast.toInt256(product) + _magnifiedCorrections[token][rewardToken][holder];
        if (magnified <= 0) return 0;
        return uint256(magnified) / MAGNITUDE;
    }

    // ---------------------------------------------------------------------
    // Owner configuration
    // ---------------------------------------------------------------------

    function setAuthorizedFunder(address funder, bool allowed) external onlyOwner {
        if (funder == address(0)) revert ZeroAddress();
        authorizedFunders[funder] = allowed;
        emit AuthorizedFunderUpdated(funder, allowed);
    }

    function setExtraRewardTokenAllowed(address rewardToken, bool allowed) external onlyOwner {
        if (rewardToken == address(0)) revert ZeroAddress();
        extraAllowedRewardTokens[rewardToken] = allowed;
        emit ExtraRewardTokenUpdated(rewardToken, allowed);
    }

    /// @dev Ownership of a contract that custodies user-claimable reward
    /// balances must always have a controlling address, mirroring
    /// PonsV2LaunchFactory's own stance on renouncement.
    function renounceOwnership() public pure override {
        revert OwnershipCannotBeRenounced();
    }

    // ---------------------------------------------------------------------
    // Tracking: opt-in, push hook, and pull fallback
    // ---------------------------------------------------------------------

    /// @notice Opts a launched token into balance tracking. Callable only by
    /// the token contract itself, once. Verified against the factory so a
    /// token can never register cashback for an address that was not
    /// actually deployed as one of its launches.
    function enableTracking() external {
        address token = msg.sender;
        if (trackingEnabled[token]) revert TrackingAlreadyEnabled();
        if (!factory.getLaunchedToken(token).exists) revert TokenNotLaunched();
        trackingEnabled[token] = true;
        emit TrackingEnabled(token);
    }

    /// @notice Push hook a tracked launched token calls on every transfer
    /// (mint: `from == address(0)`, burn: `to == address(0)`). Deliberately
    /// cheap and side-effect-only on this contract's own state: it never
    /// calls out anywhere else, so it cannot be made to revert by anything
    /// other than this contract's own accounting invariants.
    function onTokenTransfer(address from, address to, uint256 amount) external {
        address token = msg.sender;
        if (!trackingEnabled[token]) revert TrackingNotEnabled();
        if (amount == 0) return;

        if (from != address(0)) {
            uint256 bal = trackedBalanceOf[token][from];
            // A token that reports a transfer larger than what we believe
            // `from` holds (e.g. because `from` was never synced) is clamped
            // to zero rather than underflowing.
            uint256 newBal = amount > bal ? 0 : bal - amount;
            _applyBalance(token, from, newBal);
        }
        if (to != address(0)) {
            uint256 bal = trackedBalanceOf[token][to];
            _applyBalance(token, to, bal + amount);
        }
    }

    /// @notice Permissionless pull fallback: re-reads `holder`'s real
    /// balance of `token` and reconciles this contract's tracked view of it.
    /// Use this to backfill holders who held tokens before `enableTracking`
    /// was called, or to self-heal a token that was never wired with
    /// `onTokenTransfer`. Anyone may call this for any holder; it can only
    /// ever correct the record toward the truth, never move funds.
    function sync(address token, address holder) external {
        if (!trackingEnabled[token]) revert TrackingNotEnabled();
        uint256 realBalance = IERC20(token).balanceOf(holder);
        _applyBalance(token, holder, realBalance);
    }

    /// @notice Convenience wrapper for a holder syncing their own balance.
    function register(address token) external {
        if (!trackingEnabled[token]) revert TrackingNotEnabled();
        _applyBalance(token, msg.sender, IERC20(token).balanceOf(msg.sender));
    }

    function _applyBalance(address token, address holder, uint256 newBalance) private {
        uint256 oldBalance = trackedBalanceOf[token][holder];
        if (newBalance == oldBalance) return;

        trackedBalanceOf[token][holder] = newBalance;

        if (newBalance > oldBalance) {
            uint256 delta = newBalance - oldBalance;
            trackedSupplyOf[token] += delta;
            _creditCorrections(token, holder, delta, true);
        } else {
            uint256 delta = oldBalance - newBalance;
            trackedSupplyOf[token] -= delta;
            _creditCorrections(token, holder, delta, false);
        }

        emit BalanceSynced(token, holder, oldBalance, newBalance);
    }

    /// @dev Standard magnified-dividends correction: a balance increase must
    /// not retroactively grant a share of dividends already paid out before
    /// the holder had that balance, and a balance decrease must not
    /// retroactively take away a share of dividends already earned. Applied
    /// once per reward token this launch has ever been funded in, which is
    /// why that list is bounded.
    function _creditCorrections(address token, address holder, uint256 delta, bool increased) private {
        address[] storage rewardTokens = _activeRewardTokensList[token];
        uint256 len = rewardTokens.length;
        for (uint256 i; i < len; ++i) {
            address rewardToken = rewardTokens[i];
            int256 adjustment = SafeCast.toInt256(magnifiedRewardPerShare[token][rewardToken] * delta);
            if (increased) {
                _magnifiedCorrections[token][rewardToken][holder] -= adjustment;
            } else {
                _magnifiedCorrections[token][rewardToken][holder] += adjustment;
            }
        }
    }

    // ---------------------------------------------------------------------
    // Funding
    // ---------------------------------------------------------------------

    /// @notice Funds cashback for `token`'s holders with `amount` of
    /// `rewardToken`, pulled from the caller. Callable only by an
    /// authorized funder -- in practice, whatever address the protocol has
    /// pull the protocol's fee share out of the fee escrow / meme hook and
    /// forward a portion here. Splits `amount` across every currently
    /// tracked holder in proportion to their tracked balance.
    function depositReward(address token, address rewardToken, uint256 amount) external nonReentrant {
        if (!authorizedFunders[msg.sender]) revert NotAuthorizedFunder();
        if (!trackingEnabled[token]) revert TrackingNotEnabled();
        if (!isRewardTokenAllowed(rewardToken)) revert RewardTokenNotAllowed();
        if (amount == 0) revert ZeroAmount();

        uint256 supply = trackedSupplyOf[token];
        if (supply == 0) revert NoTrackedHolders();

        if (!isActiveRewardToken[token][rewardToken]) {
            address[] storage list = _activeRewardTokensList[token];
            if (list.length >= MAX_REWARD_TOKENS_PER_LAUNCH) revert TooManyRewardTokens();
            isActiveRewardToken[token][rewardToken] = true;
            list.push(rewardToken);
        }

        uint256 balanceBefore = IERC20(rewardToken).balanceOf(address(this));
        IERC20(rewardToken).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(rewardToken).balanceOf(address(this)) - balanceBefore;
        if (received == 0) revert ZeroAmount();

        magnifiedRewardPerShare[token][rewardToken] += Math.mulDiv(received, MAGNITUDE, supply);
        totalRewardsDeposited[token][rewardToken] += received;

        emit RewardDeposited(token, rewardToken, msg.sender, received);
    }

    // ---------------------------------------------------------------------
    // Claiming
    // ---------------------------------------------------------------------

    /// @notice Sets or clears (via `address(0)`) the reward token
    /// `claimPreferred` pays a holder out in for `token`.
    function setPreferredRewardToken(address token, address rewardToken) external {
        if (!trackingEnabled[token]) revert TrackingNotEnabled();
        if (rewardToken != address(0) && !isRewardTokenAllowed(rewardToken)) revert RewardTokenNotAllowed();
        preferredRewardToken[token][msg.sender] = rewardToken;
        emit PreferredRewardTokenSet(token, msg.sender, rewardToken);
    }

    /// @notice Claims everything currently owed to the caller in
    /// `rewardToken` for `token`, regardless of what their preferred reward
    /// token is set to. A holder may hold a claimable balance in several
    /// reward tokens at once (one per token the launch has been funded in)
    /// and is never forced to only ever claim their preference.
    function claim(address token, address rewardToken) external returns (uint256 amount) {
        return _claim(token, rewardToken, msg.sender);
    }

    /// @notice Claims everything currently owed to the caller in their
    /// preferred reward token for `token`.
    function claimPreferred(address token) external returns (uint256 amount) {
        address rewardToken = preferredRewardToken[token][msg.sender];
        if (rewardToken == address(0)) revert NoPreferredRewardToken();
        return _claim(token, rewardToken, msg.sender);
    }

    function _claim(address token, address rewardToken, address holder) private nonReentrant returns (uint256 amount) {
        amount = pendingReward(token, rewardToken, holder);
        if (amount == 0) revert NothingToClaim();

        withdrawnRewards[token][rewardToken][holder] += amount;
        IERC20(rewardToken).safeTransfer(holder, amount);

        emit RewardClaimed(token, rewardToken, holder, amount);
    }
}
