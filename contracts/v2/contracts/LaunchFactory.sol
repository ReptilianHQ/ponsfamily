// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

import {ILaunchFactory} from "./interfaces/ILaunchFactory.sol";
import {LaunchToken} from "./LaunchToken.sol";
import {BondingCurve} from "./BondingCurve.sol";
import {LaunchLocker} from "./LaunchLocker.sol";
import {MemeHook} from "./hook/MemeHook.sol";
import {FeeEscrow} from "./FeeEscrow.sol";
import {BuybackVault} from "./BuybackVault.sol";
import {LiquidityAmounts} from "./libraries/LiquidityAmounts.sol";
import {SqrtPrice} from "./libraries/SqrtPrice.sol";

/// @title LaunchFactory
/// @notice Entry point for launching and graduating every pons v2 token.
/// @dev Holds launch configuration, deploys a token + curve per launch, and
///      drives graduation into a permanently locked Uniswap v4 pool.
contract LaunchFactory is ILaunchFactory, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Errors (mirrors the public ABI documented for integrators)
    // ---------------------------------------------------------------------

    error LaunchConfigDisabled();
    error PairTokenNotApproved();
    error PairTokenDecimalsMismatch();
    error NativeValueMismatch();
    error LaunchFeeNotPaid();
    error CreatorTaxTooHigh();
    error NotWhitelisted();
    error LaunchEconomicsMismatch();
    error TimelockNotElapsed();
    error TimelockExpired();
    error WrongGraduationPhase();
    error NotCreatorFeeRecipient();
    error NoPendingProposal();
    error UnknownLaunch();

    // ---------------------------------------------------------------------
    // Launch configuration (append-only)
    // ---------------------------------------------------------------------

    struct LaunchConfig {
        uint256 supply;
        uint256 curveFeeBps;
        uint256 phantomQuote;
        uint256 graduationThreshold;
        uint24 poolFee;
        int24 tickSpacing;
        bool enabled;
    }

    struct PairTokenEconomics {
        uint256 phantomQuote;
        uint256 graduationThreshold;
        uint8 decimals;
    }

    struct PendingRecipientChange {
        address newRecipient;
        uint256 effectiveAt;
        uint256 expiresAt;
    }

    LaunchConfig[] private _launchConfigs;

    mapping(address => bool) public approvedPairTokens;
    mapping(address => PairTokenEconomics) public pairTokenEconomics;

    mapping(address => LaunchedToken) private _launchedTokens;
    mapping(address => FeePolicy) private _feePolicyOf;
    mapping(address => PendingRecipientChange) public pendingCreatorFeeRecipient;

    uint256 public launchFee;
    uint16 public maxCreatorTaxBps = 500; // 5% protocol cap
    bool public launchEnabled = true;
    bool public whitelistRequired = false;
    mapping(address => bool) public whitelistedLaunchers;

    FeePolicy public defaultFeePolicy;

    uint256 public constant TIMELOCK_DELAY = 3 days;
    uint256 public constant TIMELOCK_WINDOW = 3 days;
    uint256 public constant RESCUE_DELAY = 7 days;

    address public immutable feeEscrowAddress;
    address public immutable buybackVaultAddress;
    LaunchLocker public immutable launchLocker;
    MemeHook public immutable memeHook;
    IPoolManager public immutable poolManager;

    event LaunchConfigAdded(uint256 indexed id, LaunchConfig config);
    event LaunchConfigUpdated(uint256 indexed id, LaunchConfig config);
    event PairTokenApproved(address indexed pairToken, bool approved, uint256 phantomQuote, uint256 graduationThreshold);

    constructor(
        address initialOwner,
        IPoolManager poolManager_,
        address feeEscrow_,
        address buybackVault_,
        LaunchLocker launchLocker_,
        MemeHook memeHook_
    ) Ownable(initialOwner) {
        poolManager = poolManager_;
        feeEscrowAddress = feeEscrow_;
        buybackVaultAddress = buybackVault_;
        launchLocker = launchLocker_;
        memeHook = memeHook_;
    }

    // ---------------------------------------------------------------------
    // Owner administration
    // ---------------------------------------------------------------------

    function addLaunchConfig(LaunchConfig calldata config) external onlyOwner returns (uint256 id) {
        _launchConfigs.push(config);
        id = _launchConfigs.length - 1;
        emit LaunchConfigAdded(id, config);
    }

    /// @notice Configs are append-only by id, but their content (including
    ///         `enabled`) can be updated — a launch reads the config at
    ///         creation time, so this never alters an already-launched token.
    function setLaunchConfig(uint256 id, LaunchConfig calldata config) external onlyOwner {
        _launchConfigs[id] = config;
        emit LaunchConfigUpdated(id, config);
    }

    function disableLaunchConfig(uint256 id) external onlyOwner {
        _launchConfigs[id].enabled = false;
        emit LaunchConfigUpdated(id, _launchConfigs[id]);
    }

    function setPairTokenApproval(address pairToken, bool approved, uint256 phantomQuote, uint256 graduationThreshold)
        external
        onlyOwner
    {
        approvedPairTokens[pairToken] = approved;
        if (approved) {
            uint8 decimals = IERC20Metadata(pairToken).decimals();
            pairTokenEconomics[pairToken] = PairTokenEconomics(phantomQuote, graduationThreshold, decimals);
        }
        emit PairTokenApproved(pairToken, approved, phantomQuote, graduationThreshold);
    }

    function setLaunchFee(uint256 fee) external onlyOwner {
        launchFee = fee;
    }

    function setMaxCreatorTaxBps(uint16 bps) external onlyOwner {
        maxCreatorTaxBps = bps;
    }

    function setLaunchEnabled(bool enabled) external onlyOwner {
        launchEnabled = enabled;
    }

    function setWhitelistRequired(bool required) external onlyOwner {
        whitelistRequired = required;
    }

    function setWhitelisted(address launcher, bool allowed) external onlyOwner {
        whitelistedLaunchers[launcher] = allowed;
    }

    function setDefaultFeePolicy(FeePolicy calldata policy) external onlyOwner {
        defaultFeePolicy = policy;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function launchConfigCount() external view returns (uint256) {
        return _launchConfigs.length;
    }

    function getLaunchConfig(uint256 id) external view returns (LaunchConfig memory) {
        return _launchConfigs[id];
    }

    function getLaunchedToken(address token) public view returns (LaunchedToken memory) {
        return _launchedTokens[token];
    }

    function getLaunchFeePolicy(address token) external view returns (FeePolicy memory) {
        return _feePolicyOf[token];
    }

    function feeEscrow() external view returns (address) {
        return feeEscrowAddress;
    }

    function buybackVault() external view returns (address) {
        return buybackVaultAddress;
    }

    function creatorFeeRecipientOf(address token) external view returns (address) {
        return _launchedTokens[token].creatorFeeRecipient;
    }

    /// @notice Hash of every economic input that matters for a launch on this
    ///         config/pairToken combination. Pin this immediately before
    ///         calling `launchToken`; if the owner changes the config or a
    ///         pair token's economics in between, the hash changes and the
    ///         launch reverts rather than going through on different terms.
    function previewLaunchEconomics(uint256 launchConfigId, address pairToken) public view returns (bytes32) {
        LaunchConfig memory config = _launchConfigs[launchConfigId];
        (uint256 phantomQuote, uint256 threshold, ) = _economicsFor(config, pairToken);
        return keccak256(
            abi.encode(
                config.supply,
                config.curveFeeBps,
                phantomQuote,
                threshold,
                config.poolFee,
                config.tickSpacing,
                pairToken,
                maxCreatorTaxBps
            )
        );
    }

    function _economicsFor(LaunchConfig memory config, address pairToken)
        private
        view
        returns (uint256 phantomQuote, uint256 threshold, uint8 decimals)
    {
        if (pairToken == address(0)) {
            return (config.phantomQuote, config.graduationThreshold, 18);
        }
        PairTokenEconomics memory pe = pairTokenEconomics[pairToken];
        return (pe.phantomQuote, pe.graduationThreshold, pe.decimals);
    }

    // ---------------------------------------------------------------------
    // Launching
    // ---------------------------------------------------------------------

    struct TokenParams {
        string name;
        string symbol;
        string logo;
        string description;
        LaunchToken.Socials socials;
        address creatorFeeRecipient;
        uint16 creatorTaxBps;
        bool buybackEnabled;
        bytes32 expectedEconomics;
    }

    function launchToken(TokenParams calldata params, uint256 launchConfigId, address pairToken)
        external
        payable
        nonReentrant
        returns (address token, address curve)
    {
        if (!launchEnabled) revert NotWhitelisted();
        if (whitelistRequired && !whitelistedLaunchers[msg.sender]) revert NotWhitelisted();
        if (msg.value != launchFee) revert LaunchFeeNotPaid();
        if (params.creatorTaxBps > maxCreatorTaxBps) revert CreatorTaxTooHigh();

        LaunchConfig memory config = _launchConfigs[launchConfigId];
        if (!config.enabled) revert LaunchConfigDisabled();

        if (pairToken != address(0) && !approvedPairTokens[pairToken]) revert PairTokenNotApproved();

        (uint256 phantomQuote, uint256 threshold, uint8 decimals) = _economicsFor(config, pairToken);

        if (pairToken != address(0) && IERC20Metadata(pairToken).decimals() != decimals) {
            revert PairTokenDecimalsMismatch();
        }

        if (previewLaunchEconomics(launchConfigId, pairToken) != params.expectedEconomics) {
            revert LaunchEconomicsMismatch();
        }

        // Owner keeps the launch fee; forward it as native balance of this contract.
        // (No further action needed: it simply accrues to this contract's balance.)

        FeePolicy memory policy = defaultFeePolicy;

        curve = address(
            new BondingCurve(
                BondingCurve.CurveConfig({
                    factory: address(this),
                    pairToken: pairToken,
                    pairDecimals: decimals,
                    totalSupply: config.supply,
                    phantomQuote: phantomQuote,
                    graduationThreshold: threshold,
                    feeBps: config.curveFeeBps,
                    creatorTaxBps: params.creatorTaxBps,
                    buybackEnabled: params.buybackEnabled,
                    protocolFeeRecipient: policy.protocolFeeRecipient,
                    protocolFeeShareBps: policy.protocolFeeShareBps,
                    buybackShareBps: policy.buybackBurnBps
                })
            )
        );

        token = address(
            new LaunchToken(
                params.name,
                params.symbol,
                config.supply,
                curve,
                msg.sender,
                params.logo,
                params.description,
                params.socials
            )
        );

        BondingCurve(payable(curve)).initializeToken(token);

        // The factory is the escrow's and vault's owner (see deployment
        // notes in scripts/deploy.js); each curve needs to be individually
        // authorized to credit fees / lock buybacks as it is created.
        FeeEscrow(payable(feeEscrowAddress)).setAuthorized(curve, true);
        BuybackVault(buybackVaultAddress).setAuthorized(curve, true);

        address creatorRecipient = params.creatorFeeRecipient == address(0) ? msg.sender : params.creatorFeeRecipient;

        _launchedTokens[token] = LaunchedToken({
            token: token,
            curve: curve,
            deployer: msg.sender,
            creatorFeeRecipient: creatorRecipient,
            pairToken: pairToken,
            graduationThreshold: threshold,
            poolFee: config.poolFee,
            tickSpacing: config.tickSpacing,
            creatorTaxBps: params.creatorTaxBps,
            buybackEnabled: params.buybackEnabled,
            phase: Phase.NotGraduated,
            sweptQuote: 0,
            sweptTokens: 0,
            sweptAt: 0,
            exists: true
        });
        _feePolicyOf[token] = policy;

        emit TokenLaunched(token, curve, msg.sender, pairToken, launchConfigId, threshold);
    }

    // ---------------------------------------------------------------------
    // Graduation
    // ---------------------------------------------------------------------

    function notifyCurveCompleted(address token, uint256 sweptQuote, uint256 sweptTokens) external {
        LaunchedToken storage launch = _launchedTokens[token];
        if (!launch.exists) revert UnknownLaunch();
        require(msg.sender == launch.curve, "not curve");

        launch.phase = Phase.Swept;
        launch.sweptQuote = sweptQuote;
        launch.sweptTokens = sweptTokens;
        launch.sweptAt = block.timestamp;

        emit LaunchSwept(token, sweptQuote, sweptTokens);
    }

    /// @notice Permissionless. Finishes graduation for a launch sitting in
    ///         the Swept phase: pulls the swept reserves out of its curve,
    ///         initializes its Uniswap v4 pool at the price the curve closed
    ///         at, mints the full-range position, and hands it to the
    ///         permanent locker.
    function createGraduatedPool(address token) external nonReentrant {
        LaunchedToken storage launch = _launchedTokens[token];
        if (!launch.exists) revert UnknownLaunch();
        if (launch.phase != Phase.Swept) revert WrongGraduationPhase();

        (uint256 quoteAmt, uint256 tokenAmt) = BondingCurve(payable(launch.curve)).sweepForGraduation(address(this));

        // Uniswap v4 sorts currencies by raw address value; native
        // (address(0)) is always the lowest possible value, so a native-quote
        // launch always has the memecoin as currency1.
        bool memecoinIsCurrency0 = launch.pairToken != address(0) && token < launch.pairToken;

        (Currency currency0, Currency currency1) = memecoinIsCurrency0
            ? (Currency.wrap(token), Currency.wrap(launch.pairToken))
            : (Currency.wrap(launch.pairToken), Currency.wrap(token));

        PoolKey memory key = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: 0, // the hook charges the trade fee; the core pool charges nothing
            tickSpacing: launch.tickSpacing,
            hooks: memeHook
        });

        MemeHook.LaunchPoolInfo memory info = MemeHook.LaunchPoolInfo({
            memecoin: token,
            quoteToken: launch.pairToken,
            memecoinIsCurrency0: memecoinIsCurrency0,
            creatorFeeRecipient: launch.creatorFeeRecipient,
            protocolFeeRecipient: _feePolicyOf[token].protocolFeeRecipient,
            feeBps: uint16(BondingCurve(payable(launch.curve)).feeBps()),
            creatorTaxBps: launch.creatorTaxBps,
            protocolFeeShareBps: _feePolicyOf[token].protocolFeeShareBps,
            buybackShareBps: _feePolicyOf[token].buybackBurnBps,
            maxInternalPriceImpactBps: _feePolicyOf[token].maxInternalPriceImpactBps,
            buybackEnabled: launch.buybackEnabled,
            registered: false
        });
        memeHook.registerPool(key, info);

        (uint256 amount0, uint256 amount1) = memecoinIsCurrency0 ? (tokenAmt, quoteAmt) : (quoteAmt, tokenAmt);
        uint160 sqrtPriceX96 = SqrtPrice.sqrtPriceX96FromAmounts(amount0, amount1);
        poolManager.initialize(key, sqrtPriceX96);

        int24 tickLower = TickMath.minUsableTick(launch.tickSpacing);
        int24 tickUpper = TickMath.maxUsableTick(launch.tickSpacing);
        uint160 sqrtPriceAX96 = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtPriceBX96 = TickMath.getSqrtPriceAtTick(tickUpper);

        uint128 liquidity =
            LiquidityAmounts.getLiquidityForAmounts(sqrtPriceX96, sqrtPriceAX96, sqrtPriceBX96, amount0, amount1);

        if (tokenAmt > 0) IERC20(token).safeTransfer(address(launchLocker), tokenAmt);
        if (quoteAmt > 0) _forwardQuote(launch.pairToken, quoteAmt);

        launchLocker.seedPosition(key, tickLower, tickUpper, liquidity, amount0, amount1);

        launch.phase = Phase.PoolCreated;
        emit PoolGraduated(token, bytes32(0), address(poolManager));
    }

    function _forwardQuote(address pairToken, uint256 amount) private {
        if (pairToken == address(0)) {
            (bool ok, ) = address(launchLocker).call{value: amount}("");
            require(ok, "native transfer failed");
        } else {
            IERC20(pairToken).safeTransfer(address(launchLocker), amount);
        }
    }

    /// @notice Safety valve. If a launch has sat in the Swept phase for a
    ///         full week without its pool ever being created (typically
    ///         because the pair token stopped behaving as expected between
    ///         approval and graduation), the owner can return what the curve
    ///         collected instead of leaving it stranded forever.
    /// @dev Reference-implementation note: this returns the swept quote to
    ///      the launch's original deployer as a simple, auditable stand-in.
    ///      A production build should instead refund each buyer proportional
    ///      to their historical net contribution, which requires snapshotting
    ///      per-buyer curve activity — an accounting layer this reference
    ///      repo intentionally leaves out to keep BondingCurve's storage
    ///      layout minimal. Do not treat this function as buyer-fair as written.
    function rescueLaunch(address token) external onlyOwner nonReentrant {
        LaunchedToken storage launch = _launchedTokens[token];
        if (!launch.exists) revert UnknownLaunch();
        if (launch.phase != Phase.Swept) revert WrongGraduationPhase();
        require(block.timestamp >= launch.sweptAt + RESCUE_DELAY, "rescue delay not elapsed");

        (uint256 quoteAmt, uint256 tokenAmt) = BondingCurve(payable(launch.curve)).sweepForGraduation(address(this));

        // The quote side is what buyers actually paid in; return it to the
        // deployer as a simple, auditable stand-in (see NOTE above).
        if (quoteAmt > 0 && launch.pairToken != address(0)) {
            IERC20(launch.pairToken).safeTransfer(launch.deployer, quoteAmt);
        } else if (quoteAmt > 0) {
            (bool ok, ) = launch.deployer.call{value: quoteAmt}("");
            require(ok, "native transfer failed");
        }

        // Excess launch-token supply has nowhere productive to go once a
        // launch is rescued rather than graduated; lock it permanently
        // rather than returning it, so a rescue can never mint a second
        // effective supply into circulation.
        if (tokenAmt > 0) IERC20(token).safeTransfer(address(launchLocker), tokenAmt);

        launch.phase = Phase.Rescued;
        emit LaunchRescued(token, quoteAmt);
    }

    // ---------------------------------------------------------------------
    // Community takeovers / creator fee recipient
    // ---------------------------------------------------------------------

    /// @notice Immediate, voluntary handoff by the current recipient.
    function transferCreatorFeeRecipient(address token, address newRecipient) external {
        LaunchedToken storage launch = _launchedTokens[token];
        if (!launch.exists) revert UnknownLaunch();
        if (msg.sender != launch.creatorFeeRecipient) revert NotCreatorFeeRecipient();

        address old = launch.creatorFeeRecipient;
        launch.creatorFeeRecipient = newRecipient;
        emit CreatorFeeRecipientUpdated(token, old, newRecipient);
    }

    /// @notice Owner-proposed takeover for an abandoned launch. Takes effect
    ///         no sooner than three days from now (so holders have advance
    ///         public notice) and expires if nobody executes it within a
    ///         further three days after that.
    function proposeCreatorFeeRecipient(address token, address newRecipient) external onlyOwner {
        if (!_launchedTokens[token].exists) revert UnknownLaunch();
        uint256 effectiveAt = block.timestamp + TIMELOCK_DELAY;
        uint256 expiresAt = effectiveAt + TIMELOCK_WINDOW;
        pendingCreatorFeeRecipient[token] = PendingRecipientChange(newRecipient, effectiveAt, expiresAt);
        emit CreatorFeeRecipientChangeProposed(token, newRecipient, effectiveAt, expiresAt);
    }

    /// @notice Permissionless once the delay has elapsed. Note that the
    ///         current recipient moving fees elsewhere during the wait does
    ///         NOT cancel this proposal — if it did, a stolen wallet could be
    ///         used to sidestep the exact recovery the proposal exists for.
    function executeCreatorFeeRecipientChange(address token) external {
        PendingRecipientChange memory pending = pendingCreatorFeeRecipient[token];
        if (pending.effectiveAt == 0) revert NoPendingProposal();
        if (block.timestamp < pending.effectiveAt) revert TimelockNotElapsed();
        if (block.timestamp > pending.expiresAt) revert TimelockExpired();

        LaunchedToken storage launch = _launchedTokens[token];
        address old = launch.creatorFeeRecipient;
        launch.creatorFeeRecipient = pending.newRecipient;
        delete pendingCreatorFeeRecipient[token];

        emit CreatorFeeRecipientUpdated(token, old, pending.newRecipient);
    }

    function cancelCreatorFeeRecipientChange(address token) external onlyOwner {
        delete pendingCreatorFeeRecipient[token];
    }

    /// @notice Lets the owner withdraw accumulated launch fees.
    function withdrawLaunchFees(address to, uint256 amount) external onlyOwner {
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "native transfer failed");
    }

    receive() external payable {}
}
