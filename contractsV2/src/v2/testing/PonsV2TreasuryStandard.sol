// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {PonsV2LaunchFactory} from "./PonsV2LaunchFactory.sol";

/**
 * @title PonsV2TreasuryStandard
 * @notice The $TREASURY standard for Pons V2 launches: every launch that
 * opts in accumulates and spends a pooled balance of $TREASURY at the
 * launch level, through an explicit, creator-configured policy -- never
 * claimed per holder. $TREASURY (`TREASURY_TOKEN`, defined below) is not
 * an implementation detail of this contract; it is the reason this
 * contract exists. Every launch that opts into Pons Treasury is, by
 * construction, opting into $TREASURY.
 *
 * @dev This is deliberately the opposite shape of PonsV2CashbackRewards:
 * cashback pays *holders* proportionally to what they hold; treasury pays
 * *the launch itself* a pool -- denominated in $TREASURY by default -- that
 * it can later deploy (buybacks, funding, ecosystem spend) through
 * whichever executor the creator has authorized. There is no per-holder
 * accounting here at all -- just a balance per (launch, asset) and a gate
 * on who is allowed to move it out.
 *
 * $TREASURY:
 * `TREASURY_TOKEN` is hardcoded as this standard's canonical asset. It is
 * always an allowed treasury holding (see `isTreasuryAssetAllowed`),
 * independent of the factory's approved pair tokens or the owner's extra
 * whitelist, and every asset-taking function (`enableTreasury`,
 * `depositTreasury`, `withdrawForBuyback`) has an overload that omits the
 * `asset` parameter entirely and resolves to $TREASURY. Dedicated views --
 * `treasuryTokenBalance`, `treasuryTokenNAV`, `totalTreasuryTokenFunded`,
 * `isTreasuryToken` -- exist so dashboards and integrators can read a
 * launch's $TREASURY position directly, without threading the asset
 * address through every call. A launch remains free to additionally hold
 * other approved assets (up to `MAX_TREASURY_ASSETS_PER_LAUNCH` total),
 * but $TREASURY is the asset this standard is built around, and the one
 * every default code path leads to.
 *
 * $PONS remains the ecosystem/protocol token; that does not change here.
 * What changes is that within the Treasury standard itself, $TREASURY --
 * not an arbitrary "whatever asset a launch happens to pick" -- is the
 * headline asset every launch's own treasury is anchored to, accumulates,
 * and spends.
 *
 * WIRING THIS CONTRACT UP (required, external to this file):
 * 1. The protocol (or a keeper acting on the protocol's behalf) grants an
 *    `authorizedFunders` role to whatever address forwards a slice of a
 *    launch's fee share into its treasury, e.g. from IPonsV2FeeEscrow or
 *    PonsV2BuybackVault. This contract deliberately does not reach into
 *    either of those itself -- it only knows how to receive an amount it
 *    has been given allowance for, so it stays correct regardless of
 *    exactly how upstream fee accounting works. In the common case that
 *    slice is swapped or routed into $TREASURY upstream, so what lands
 *    here via the default overloads is $TREASURY itself.
 * 2. A launch opts in once via `enableTreasury`, called by the token
 *    contract itself (typically from its own constructor), naming its
 *    creator as the treasury's initial admin. The no-asset overload is the
 *    expected path and anchors the launch to $TREASURY from the start.
 * 3. The admin (the launch's creator, or whoever it is transferred to)
 *    configures `setTreasuryPolicy` and authorizes one or more
 *    `setExecutor` addresses -- e.g. PonsV2BuybackVault -- allowed to move
 *    funds out of the treasury for that specific launch.
 * 4. A launch that never calls `enableTreasury` costs nothing: this
 *    contract never touches trading, graduation, or fee collection itself.
 */
contract PonsV2TreasuryStandard is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Bounds the list `_activeAssetsList` grows to per launch, so a
    // treasury cannot be funded in an unbounded number of distinct assets
    // and turn view/accounting loops into unbounded-gas operations.
    uint256 public constant MAX_TREASURY_ASSETS_PER_LAUNCH = 8;

    // $TREASURY -- the canonical asset of the Pons Treasury standard
    // itself, and the reason this contract exists. Every launch that opts
    // in is, by default, opting into accumulating and spending *this*
    // asset: it is always an allowed treasury asset (see
    // `isTreasuryAssetAllowed`), independent of the factory's approved
    // pair tokens or the owner's extra whitelist, and every asset-taking
    // function below (`enableTreasury`, `depositTreasury`,
    // `withdrawForBuyback`) has an overload that omits the `asset`
    // parameter and resolves to $TREASURY automatically. A launch is
    // always free to additionally hold other approved assets (up to
    // `MAX_TREASURY_ASSETS_PER_LAUNCH`), but $TREASURY is the asset this
    // standard is built around.
    address public constant TREASURY_TOKEN = ;

    error ZeroAddress();
    error ZeroAmount();
    error TokenNotLaunched();
    error TreasuryAlreadyEnabled();
    error TreasuryNotEnabled();
    error NotAuthorizedFunder();
    error NotAuthorizedExecutor();
    error NotTreasuryAdmin();
    error AssetNotAllowed();
    error TooManyTreasuryAssets();
    error InsufficientTreasuryBalance();
    error OwnershipCannotBeRenounced();

    event TreasuryEnabled(address indexed token, address indexed admin, address indexed initialAsset);
    event AuthorizedFunderUpdated(address indexed funder, bool allowed);
    event ExtraTreasuryAssetUpdated(address indexed asset, bool allowed);
    event ExecutorUpdated(address indexed token, address indexed executor, bool allowed);
    event AdminTransferred(address indexed token, address indexed oldAdmin, address indexed newAdmin);
    event TreasuryPolicySet(address indexed token, uint16 treasuryShareBps, bool buybackEnabled);
    event TreasuryFunded(address indexed token, address indexed asset, address indexed funder, uint256 amount);
    event TreasuryWithdrawn(address indexed token, address indexed asset, address indexed executor, address to, uint256 amount);

    /// @notice Describes how a launch has chosen to run its own treasury.
    /// Purely policy metadata plus the one behavioral switch this contract
    /// itself enforces (`buybackEnabled` gates `withdrawForBuyback`); the
    /// actual fee split into the treasury happens upstream, the same way
    /// cashback funding happens upstream of `depositReward`.
    struct TreasuryPolicy {
        uint16 treasuryShareBps; // informational: bps of protocol fee share routed here upstream
        bool buybackEnabled; // whether withdrawForBuyback is currently permitted at all
    }

    /// @notice The launch factory this contract sources launch validity and
    /// creator identity from. Immutable: a treasury deployment is scoped to
    /// exactly one factory's launches for its entire life.
    PonsV2LaunchFactory public immutable factory;

    /// @notice Whether a launched token has opted itself into the treasury
    /// standard, and therefore into $TREASURY.
    mapping(address token => bool enabled) public treasuryEnabled;

    /// @notice The admin for a launch's treasury -- set to the launch's
    /// creator at `enableTreasury`, transferable by the current admin. Only
    /// this address may configure policy or authorize executors for that
    /// launch.
    mapping(address token => address admin) public treasuryAdmin;

    /// @notice Current policy for a launch's treasury. Defaults to
    /// buyback disabled until the admin explicitly turns it on.
    mapping(address token => TreasuryPolicy policy) public treasuryPolicyOf;

    /// @notice Pooled balance this contract holds for a launch in a given
    /// asset. Unlike cashback, this is never split per holder -- it is a
    /// single balance the treasury's executors can move out under policy.
    /// `treasuryBalance[token][TREASURY_TOKEN]` is a launch's $TREASURY
    /// position; see also `treasuryTokenBalance` for a direct accessor.
    mapping(address token => mapping(address asset => uint256 balance)) public treasuryBalance;

    /// @notice Total ever deposited for a (launch, asset) pair, for
    /// off-chain accounting / NAV dashboards; plays no role in withdrawal
    /// authorization.
    mapping(address token => mapping(address asset => uint256 total)) public totalTreasuryFunded;

    mapping(address token => mapping(address asset => bool isActive)) public isActiveTreasuryAsset;
    mapping(address token => address[] assets) private _activeAssetsList;

    /// @notice Per-launch addresses allowed to withdraw from that launch's
    /// treasury, e.g. a PonsV2BuybackVault instance. Set by that launch's
    /// admin (or the contract owner, for protocol-operated executors).
    mapping(address token => mapping(address executor => bool allowed)) public authorizedExecutors;

    /// @notice Addresses allowed to fund any launch's treasury, e.g. a
    /// keeper forwarding a slice of fee share pulled from the fee escrow /
    /// buyback vault, typically already converted to $TREASURY upstream.
    /// Owner-managed, protocol-wide (unlike executors, which are scoped
    /// per launch by that launch's own admin).
    mapping(address funder => bool allowed) public authorizedFunders;

    /// @notice Assets allowed as treasury holdings beyond $TREASURY and the
    /// factory's own approved pair tokens. See `isTreasuryAssetAllowed`.
    mapping(address asset => bool allowed) public extraAllowedTreasuryAssets;

    modifier onlyTreasuryAdmin(address token) {
        if (msg.sender != treasuryAdmin[token]) revert NotTreasuryAdmin();
        _;
    }

    constructor(address initialOwner, PonsV2LaunchFactory factory_) Ownable(initialOwner) {
        if (address(factory_) == address(0)) revert ZeroAddress();
        factory = factory_;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice True only for $TREASURY (`TREASURY_TOKEN`), this standard's
    /// canonical asset. Purely a readability helper for front ends and
    /// integrators that want to brand $TREASURY balances distinctly from
    /// any other asset a launch's treasury happens to also hold.
    function isTreasuryToken(address asset) public pure returns (bool) {
        return asset == TREASURY_TOKEN;
    }

    /// @notice An asset is a valid treasury holding if it is $TREASURY
    /// (`TREASURY_TOKEN`, this standard's canonical asset), one of the
    /// factory's own approved pair tokens, or has been separately
    /// whitelisted here (e.g. a buyback-proceeds token that was never meant
    /// to be a pair asset).
    function isTreasuryAssetAllowed(address asset) public view returns (bool) {
        return asset == TREASURY_TOKEN || factory.approvedPairTokens(asset)
            || extraAllowedTreasuryAssets[asset];
    }

    /// @notice The full list of assets a launch's treasury has ever been
    /// funded in.
    function activeTreasuryAssets(address token) external view returns (address[] memory) {
        return _activeAssetsList[token];
    }

    /// @notice Current net asset value of a launch's treasury in `asset`.
    /// A thin, explicitly-named alias over `treasuryBalance` for dashboards
    /// that want to display "Treasury NAV" alongside market cap / liquidity.
    function treasuryNAV(address token, address asset) external view returns (uint256) {
        return treasuryBalance[token][asset];
    }

    /// @notice A launch's current $TREASURY balance. Equivalent to
    /// `treasuryBalance[token][TREASURY_TOKEN]`, exposed directly so
    /// integrators reading a launch's headline treasury position don't
    /// need to pass the asset address themselves.
    function treasuryTokenBalance(address token) external view returns (uint256) {
        return treasuryBalance[token][TREASURY_TOKEN];
    }

    /// @notice A launch's current $TREASURY NAV. Identical to
    /// `treasuryTokenBalance`; provided under the "NAV" name to match
    /// `treasuryNAV` for dashboards that display Treasury NAV alongside
    /// market cap and liquidity.
    function treasuryTokenNAV(address token) external view returns (uint256) {
        return treasuryBalance[token][TREASURY_TOKEN];
    }

    /// @notice Total $TREASURY ever deposited into a launch's treasury,
    /// for off-chain accounting / NAV dashboards; plays no role in
    /// withdrawal authorization.
    function totalTreasuryTokenFunded(address token) external view returns (uint256) {
        return totalTreasuryFunded[token][TREASURY_TOKEN];
    }

    // ---------------------------------------------------------------------
    // Owner configuration
    // ---------------------------------------------------------------------

    function setAuthorizedFunder(address funder, bool allowed) external onlyOwner {
        if (funder == address(0)) revert ZeroAddress();
        authorizedFunders[funder] = allowed;
        emit AuthorizedFunderUpdated(funder, allowed);
    }

    function setExtraTreasuryAssetAllowed(address asset, bool allowed) external onlyOwner {
        if (asset == address(0)) revert ZeroAddress();
        extraAllowedTreasuryAssets[asset] = allowed;
        emit ExtraTreasuryAssetUpdated(asset, allowed);
    }

    /// @dev Ownership of a contract that custodies launch treasury balances
    /// must always have a controlling address, mirroring
    /// PonsV2LaunchFactory's and PonsV2CashbackRewards's own stance.
    function renounceOwnership() public pure override {
        revert OwnershipCannotBeRenounced();
    }

    // ---------------------------------------------------------------------
    // Opt-in
    // ---------------------------------------------------------------------

    /// @notice Convenience overload of `enableTreasury` that opts in using
    /// $TREASURY (`TREASURY_TOKEN`), this standard's canonical asset, as
    /// the initial asset. This is the expected path: a launch anchors its
    /// treasury to $TREASURY without naming it explicitly.
    function enableTreasury(address admin) external {
        enableTreasury(admin, TREASURY_TOKEN);
    }

    /// @notice Opts a launched token into the treasury standard. Callable
    /// only by the token contract itself, once. Verified against the
    /// factory so a token can never spin up a treasury for an address that
    /// was not actually deployed as one of its launches. `admin` becomes
    /// the sole party able to configure policy and authorize executors for
    /// this launch -- normally the launch's creator. Most launches should
    /// use the single-argument overload above and start on $TREASURY;
    /// `initialAsset` exists for a launch that deliberately wants to start
    /// on a different approved asset instead.
    function enableTreasury(address admin, address initialAsset) public {
        address token = msg.sender;
        if (treasuryEnabled[token]) revert TreasuryAlreadyEnabled();
        if (!factory.getLaunchedToken(token).exists) revert TokenNotLaunched();
        if (admin == address(0)) revert ZeroAddress();
        if (!isTreasuryAssetAllowed(initialAsset)) revert AssetNotAllowed();

        treasuryEnabled[token] = true;
        treasuryAdmin[token] = admin;
        isActiveTreasuryAsset[token][initialAsset] = true;
        _activeAssetsList[token].push(initialAsset);

        emit TreasuryEnabled(token, admin, initialAsset);
    }

    /// @notice Hands treasury admin rights for `token` to `newAdmin`.
    /// Callable only by the current admin.
    function transferTreasuryAdmin(address token, address newAdmin) external onlyTreasuryAdmin(token) {
        if (newAdmin == address(0)) revert ZeroAddress();
        address old = treasuryAdmin[token];
        treasuryAdmin[token] = newAdmin;
        emit AdminTransferred(token, old, newAdmin);
    }

    // ---------------------------------------------------------------------
    // Policy & executors (launch-admin controlled)
    // ---------------------------------------------------------------------

    /// @notice Sets the launch's treasury policy. `treasuryShareBps` is
    /// informational metadata for UIs and off-chain funders -- typically
    /// the share of protocol fees routed into $TREASURY and forwarded here
    /// -- this contract does not itself enforce what share of fees gets
    /// routed in, the same way cashback funding amounts are not enforced by
    /// PonsV2CashbackRewards. `buybackEnabled` is the one switch this
    /// contract does enforce, gating `withdrawForBuyback`.
    function setTreasuryPolicy(address token, uint16 treasuryShareBps, bool buybackEnabled)
        external
        onlyTreasuryAdmin(token)
    {
        treasuryPolicyOf[token] = TreasuryPolicy({treasuryShareBps: treasuryShareBps, buybackEnabled: buybackEnabled});
        emit TreasuryPolicySet(token, treasuryShareBps, buybackEnabled);
    }

    /// @notice Authorizes or revokes an executor (e.g. a
    /// PonsV2BuybackVault instance) allowed to withdraw from `token`'s
    /// treasury. Callable by that launch's admin, or by the contract owner
    /// for protocol-operated executors shared across launches.
    function setExecutor(address token, address executor, bool allowed) external {
        if (msg.sender != treasuryAdmin[token] && msg.sender != owner()) revert NotTreasuryAdmin();
        if (executor == address(0)) revert ZeroAddress();
        authorizedExecutors[token][executor] = allowed;
        emit ExecutorUpdated(token, executor, allowed);
    }

    // ---------------------------------------------------------------------
    // Funding
    // ---------------------------------------------------------------------

    /// @notice Convenience overload of `depositTreasury` that funds
    /// `token`'s treasury in $TREASURY (`TREASURY_TOKEN`), this standard's
    /// canonical asset. This is the expected funding path for a launch on
    /// the default policy.
    function depositTreasury(address token, uint256 amount) external {
        depositTreasury(token, TREASURY_TOKEN, amount);
    }

    /// @notice Funds `token`'s treasury with `amount` of `asset`, pulled
    /// from the caller. Callable only by an authorized funder -- in
    /// practice, whatever address the protocol has pull a launch's fee
    /// share out of the fee escrow / buyback vault, typically already
    /// converted into $TREASURY, and forward a portion here. Measures what
    /// was actually received so fee-on-transfer assets cannot silently
    /// under-credit the treasury. Most callers should use the two-argument
    /// overload above and fund in $TREASURY directly; this explicit form
    /// exists for a launch that also holds a second approved asset.
    function depositTreasury(address token, address asset, uint256 amount) public nonReentrant {
        if (!authorizedFunders[msg.sender]) revert NotAuthorizedFunder();
        if (!treasuryEnabled[token]) revert TreasuryNotEnabled();
        if (!isTreasuryAssetAllowed(asset)) revert AssetNotAllowed();
        if (amount == 0) revert ZeroAmount();

        if (!isActiveTreasuryAsset[token][asset]) {
            address[] storage list = _activeAssetsList[token];
            if (list.length >= MAX_TREASURY_ASSETS_PER_LAUNCH) revert TooManyTreasuryAssets();
            isActiveTreasuryAsset[token][asset] = true;
            list.push(asset);
        }

        uint256 balanceBefore = IERC20(asset).balanceOf(address(this));
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(asset).balanceOf(address(this)) - balanceBefore;
        if (received == 0) revert ZeroAmount();

        treasuryBalance[token][asset] += received;
        totalTreasuryFunded[token][asset] += received;

        emit TreasuryFunded(token, asset, msg.sender, received);
    }

    // ---------------------------------------------------------------------
    // Spending
    // ---------------------------------------------------------------------

    /// @notice Convenience overload of `withdrawForBuyback` that spends
    /// $TREASURY (`TREASURY_TOKEN`), this standard's canonical asset --
    /// the expected path for a launch buying back its own token with its
    /// $TREASURY balance.
    function withdrawForBuyback(address token, uint256 amount, address to) external returns (uint256) {
        return withdrawForBuyback(token, TREASURY_TOKEN, amount, to);
    }

    /// @notice Moves `amount` of `asset` out of `token`'s treasury to `to`.
    /// Callable only by an address the launch's admin (or owner) has
    /// authorized as an executor for that specific launch, and only while
    /// that launch's policy has `buybackEnabled` set. No swap or oracle
    /// logic lives here: an executor (e.g. PonsV2BuybackVault) is
    /// responsible for whatever it does with the asset once received. Most
    /// callers should use the three-argument overload above and spend
    /// $TREASURY directly; this explicit form exists for a launch that
    /// also holds a second approved asset.
    function withdrawForBuyback(address token, address asset, uint256 amount, address to)
        public
        nonReentrant
        returns (uint256)
    {
        if (!authorizedExecutors[token][msg.sender]) revert NotAuthorizedExecutor();
        if (!treasuryPolicyOf[token].buybackEnabled) revert NotAuthorizedExecutor();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (treasuryBalance[token][asset] < amount) revert InsufficientTreasuryBalance();

        treasuryBalance[token][asset] -= amount;
        IERC20(asset).safeTransfer(to, amount);

        emit TreasuryWithdrawn(token, asset, msg.sender, to, amount);
        return amount;
    }
}
