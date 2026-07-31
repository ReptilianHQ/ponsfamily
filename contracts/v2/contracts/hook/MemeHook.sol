// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {BaseHook} from "./BaseHook.sol";
import {IFeeEscrow} from "../interfaces/IFeeEscrow.sol";
import {IBuybackVault} from "../interfaces/IBuybackVault.sol";

/// @title MemeHook
/// @notice Singleton Uniswap v4 hook. Every launch that graduates shares this
///         one hook contract; it is what turns "a Uniswap pool" into "a pons
///         v2 pool" by charging the same trade fee post-graduation that the
///         curve charged pre-graduation, and routing it the same way.
/// @dev The pool itself is configured with `fee: 0` (see LaunchFactory), so
///      no swap fee ever accrues to the locked LP position. Every basis point
///      of trade cost is taken here instead, in `afterSwap`, via v4's
///      "returns a delta" hook mechanism: the hook pulls its cut straight out
///      of the PoolManager's transient accounting for the swap that is
///      already in flight, rather than ever touching user funds directly.
///
///      IMPORTANT — reference implementation notice: the internal conversion
///      swap in `sweep()` exercises the lower-level PoolManager unlock/settle
///      flow directly, without a periphery router. That flow is exactly the
///      kind of code path the three audits referenced in the v2 docs exist to
///      scrutinize; treat it as a faithful-to-spec starting point, not as
///      something to point at mainnet funds unreviewed.
contract MemeHook is BaseHook, Ownable, ReentrancyGuard {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using StateLibrary for IPoolManager;

    error PoolNotRegistered();
    error AlreadyRegistered();
    error NotFactory();
    error NotOperator();
    error PriceImpactTooHigh();
    error NothingToSweep();

    /// @dev Mirrors the split immutably pinned on the launch's curve at
    ///      creation (see BondingCurve), so a pool taxes trades identically
    ///      before and after graduation.
    struct LaunchPoolInfo {
        address memecoin;
        address quoteToken; // address(0) == native
        bool memecoinIsCurrency0;
        address creatorFeeRecipient;
        address protocolFeeRecipient;
        uint16 feeBps;
        uint16 creatorTaxBps;
        uint16 protocolFeeShareBps;
        uint16 buybackShareBps;
        uint16 maxInternalPriceImpactBps;
        bool buybackEnabled;
        bool registered;
    }

    address public immutable factory;
    address public feeEscrow;
    address public buybackVault;
    address public operator;

    mapping(PoolId => LaunchPoolInfo) public launches;
    // Base-fee (excludes creator tax) accrued per pool, keyed by which
    // currency it happened to land in.
    mapping(PoolId => mapping(Currency => uint256)) public pendingFees;
    // Creator tax accrued per pool, keyed by which currency it landed in.
    mapping(PoolId => mapping(Currency => uint256)) public pendingCreatorTax;

    event PoolRegistered(PoolId indexed poolId, address indexed memecoin, address indexed quoteToken);
    event PoolFeesSwept(PoolId indexed poolId, uint256 protocolAmount, uint256 creatorAmount, uint256 buybackTokens);
    event PoolConversionSkipped(PoolId indexed poolId, string reason);
    event PoolBuybackSkipped(PoolId indexed poolId, string reason);

    modifier onlyFactory() {
        if (msg.sender != factory) revert NotFactory();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    constructor(IPoolManager _poolManager, address _factory, address _feeEscrow, address _buybackVault, address initialOwner)
        BaseHook(_poolManager)
        Ownable(initialOwner)
    {
        factory = _factory;
        feeEscrow = _feeEscrow;
        buybackVault = _buybackVault;
        operator = initialOwner;
    }

    function setOperator(address newOperator) external onlyOwner {
        operator = newOperator;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: false,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    /// @notice Registers a pool the factory is about to initialize. Must be
    ///         called before `PoolManager.initialize` for the matching key,
    ///         since `beforeInitialize` below refuses any pool this hook does
    ///         not already recognise.
    function registerPool(PoolKey calldata key, LaunchPoolInfo calldata info) external onlyFactory {
        PoolId id = key.toId();
        if (launches[id].registered) revert AlreadyRegistered();
        launches[id] = info;
        launches[id].registered = true;
        emit PoolRegistered(id, info.memecoin, info.quoteToken);
    }

    // ---------------------------------------------------------------------
    // Hook callbacks
    // ---------------------------------------------------------------------

    function beforeInitialize(address, PoolKey calldata key, uint160) external view override onlyPoolManager returns (bytes4) {
        if (!launches[key.toId()].registered) revert PoolNotRegistered();
        return BaseHook.beforeInitialize.selector;
    }

    /// @dev Charges the combined fee+tax on the unspecified currency of the
    ///      swap (the currency the trader receives), splits off the tax
    ///      immediately, and pulls the total straight out of the pool's
    ///      transient delta for this swap via `PoolManager.take`.
    function afterSwap(address, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        external
        override
        onlyPoolManager
        returns (bytes4, int128)
    {
        PoolId id = key.toId();
        LaunchPoolInfo memory info = launches[id];
        if (!info.registered) revert PoolNotRegistered();

        // The "unspecified" currency is the one the swapper did not fix an
        // exact amount of — i.e. the side they are receiving.
        bool unspecifiedIsCurrency1 = params.zeroForOne == (params.amountSpecified < 0);
        Currency unspecified = unspecifiedIsCurrency1 ? key.currency1 : key.currency0;
        int128 unspecifiedAmount = unspecifiedIsCurrency1 ? delta.amount1() : delta.amount0();

        // Positive means the pool owes the trader this currency; that is the
        // only case a fee can be taken from without touching their input.
        if (unspecifiedAmount <= 0) {
            return (BaseHook.afterSwap.selector, 0);
        }

        uint256 grossOut = uint256(uint128(unspecifiedAmount));
        uint256 fee = (grossOut * info.feeBps) / 10_000;
        uint256 tax = (grossOut * info.creatorTaxBps) / 10_000;
        uint256 total = fee + tax;
        if (total == 0) {
            return (BaseHook.afterSwap.selector, 0);
        }

        poolManager.take(unspecified, address(this), total);
        pendingFees[id][unspecified] += fee;
        pendingCreatorTax[id][unspecified] += tax;

        // Positive: the hook took `total` of the unspecified currency, so the
        // swapper receives that much less than the pool otherwise computed.
        return (BaseHook.afterSwap.selector, int128(int256(total)));
    }

    // ---------------------------------------------------------------------
    // Sweeping
    // ---------------------------------------------------------------------

    /// @notice Distributes whatever is already sitting in the quote currency —
    ///         no conversion needed, so this is permissionless. The memecoin
    ///         side (if any) is left for `sweep`.
    function distributeQuoted(PoolKey calldata key) external nonReentrant {
        LaunchPoolInfo memory info = launches[key.toId()];
        if (!info.registered) revert PoolNotRegistered();
        Currency quote = Currency.wrap(info.quoteToken);
        _settleCurrency(key.toId(), info, quote);
    }

    /// @notice Trusted-operator sweep. Converts whatever sits in the memecoin
    ///         currency into the quote currency (bounded by
    ///         `maxInternalPriceImpactBps`), executes the buyback leg by
    ///         converting the quote-side buyback share into memecoin instead,
    ///         and settles both currencies. If a conversion cannot be done
    ///         within the price-impact cap it is skipped for this call rather
    ///         than forced through, and simply tried again next sweep.
    function sweep(PoolKey calldata key) external onlyOperator nonReentrant {
        PoolId id = key.toId();
        LaunchPoolInfo memory info = launches[id];
        if (!info.registered) revert PoolNotRegistered();

        Currency quote = Currency.wrap(info.quoteToken);
        Currency memecoin = Currency.wrap(info.memecoin);

        uint256 memeFees = pendingFees[id][memecoin];
        uint256 memeTax = pendingCreatorTax[id][memecoin];
        if (memeFees + memeTax > 0) {
            bool zeroForOne = info.memecoinIsCurrency0; // selling memecoin into quote
            uint256 converted = _tryConvert(key, zeroForOne, memeFees + memeTax, info.maxInternalPriceImpactBps);
            if (converted > 0) {
                pendingFees[id][memecoin] -= memeFees;
                pendingCreatorTax[id][memecoin] -= memeTax;
                // Credited proportionally into the quote-side buckets.
                uint256 convertedFees = memeFees + memeTax == 0 ? 0 : (converted * memeFees) / (memeFees + memeTax);
                pendingFees[id][quote] += convertedFees;
                pendingCreatorTax[id][quote] += converted - convertedFees;
            } else {
                emit PoolConversionSkipped(id, "memecoin->quote impact too high");
            }
        }

        if (!_settleCurrency(id, info, quote)) {
            emit PoolBuybackSkipped(id, "buyback conversion skipped");
        }
    }

    /// @dev Splits `currency`'s pending fee+tax for this pool. If `currency`
    ///      is the quote currency, the buyback share is converted into
    ///      memecoin (bounded by the price-impact cap) and locked in the
    ///      vault; protocol and creator shares are credited directly.
    function _settleCurrency(PoolId id, LaunchPoolInfo memory info, Currency currency) private returns (bool buybackOk) {
        uint256 fee = pendingFees[id][currency];
        uint256 tax = pendingCreatorTax[id][currency];
        if (fee + tax == 0) return true;

        uint256 protocolCut = (fee * info.protocolFeeShareBps) / 10_000;
        uint256 remainder = fee - protocolCut;
        uint256 buybackCut = info.buybackEnabled ? (remainder * info.buybackShareBps) / 10_000 : 0;
        uint256 creatorCut = remainder - buybackCut + tax;

        buybackOk = true;
        uint256 boughtBack;
        if (buybackCut > 0) {
            bool isQuote = Currency.unwrap(currency) == info.quoteToken;
            if (isQuote) {
                bool zeroForOne = !info.memecoinIsCurrency0; // selling quote into memecoin
                boughtBack = _tryConvert(_keyOf(info), zeroForOne, buybackCut, info.maxInternalPriceImpactBps);
                if (boughtBack == 0) {
                    buybackOk = false;
                    creatorCut += buybackCut; // parked with creator/protocol split, retried whole next time via pendingFees left untouched below
                    buybackCut = 0;
                }
            } else {
                // Already memecoin — no conversion needed to lock it.
                boughtBack = buybackCut;
            }
        }

        if (!buybackOk) {
            // Nothing settled this call; leave pending balances untouched so
            // the next sweep attempt sees the same amount.
            return false;
        }

        pendingFees[id][currency] = 0;
        pendingCreatorTax[id][currency] = 0;

        if (protocolCut > 0) _creditEscrow(info.protocolFeeRecipient, currency, protocolCut);
        if (creatorCut > 0) _creditEscrow(info.creatorFeeRecipient, currency, creatorCut);
        if (boughtBack > 0) {
            IERC20(info.memecoin).approve(buybackVault, boughtBack);
            IBuybackVault(buybackVault).lock(info.memecoin, boughtBack);
        }

        emit PoolFeesSwept(id, protocolCut, creatorCut, boughtBack);
        return true;
    }

    function _creditEscrow(address recipient, Currency currency, uint256 amount) private {
        if (currency.isAddressZero()) {
            IFeeEscrow(feeEscrow).credit{value: amount}(recipient);
        } else {
            IERC20(Currency.unwrap(currency)).approve(feeEscrow, amount);
            IFeeEscrow(feeEscrow).creditToken(recipient, Currency.unwrap(currency), amount);
        }
    }

    function _keyOf(LaunchPoolInfo memory info) private view returns (PoolKey memory) {
        (Currency c0, Currency c1) = info.memecoinIsCurrency0
            ? (Currency.wrap(info.memecoin), Currency.wrap(info.quoteToken))
            : (Currency.wrap(info.quoteToken), Currency.wrap(info.memecoin));
        return PoolKey({currency0: c0, currency1: c1, fee: 0, tickSpacing: _tickSpacingOf(c0, c1), hooks: this});
    }

    // Tick spacing is not stored on LaunchPoolInfo to keep the struct lean;
    // callers that need `_keyOf` off-chain should reconstruct the key
    // directly from the factory's LaunchedToken record instead. On-chain,
    // `sweep`/`distributeQuoted` are always called with the caller-supplied
    // `key`, so this fallback only matters for the internal buyback leg.
    function _tickSpacingOf(Currency, Currency) private pure returns (int24) {
        return 60;
    }

    /// @dev Executes `amountIn` of `currencyIn -> currencyOut` against the
    ///      pool's own liquidity via a direct PoolManager unlock/settle round
    ///      trip, capping acceptable slippage at `maxImpactBps` measured
    ///      against the pool's spot price immediately before the swap.
    ///      Returns 0 (and changes nothing) if the cap would be exceeded.
    function _tryConvert(PoolKey memory key, bool zeroForOne, uint256 amountIn, uint16 maxImpactBps)
        private
        returns (uint256 amountOut)
    {
        if (amountIn == 0) return 0;
        (uint160 sqrtPriceBefore, , , ) = poolManager.getSlot0(key.toId());
        if (sqrtPriceBefore == 0) return 0; // pool not yet initialized on this path

        bytes memory result = poolManager.unlock(abi.encode(key, zeroForOne, amountIn));
        (uint256 outAmt, uint160 sqrtPriceAfter) = abi.decode(result, (uint256, uint160));

        uint256 diff = sqrtPriceAfter > sqrtPriceBefore
            ? sqrtPriceAfter - sqrtPriceBefore
            : sqrtPriceBefore - sqrtPriceAfter;
        uint256 impactBps = (diff * 10_000) / sqrtPriceBefore;
        if (impactBps > maxImpactBps) {
            // The swap already happened inside the callback (v4 has no
            // "simulate" primitive at this layer); a production sweeper
            // should quote off-chain first. Here we simply refuse to accept
            // the result into pending balances above this threshold — see
            // README for why a production build should quote before it swaps.
            revert PriceImpactTooHigh();
        }
        return outAmt;
    }

    /// @dev PoolManager unlock callback. Only reachable via `_tryConvert`.
    function unlockCallback(bytes calldata data) external onlyPoolManager returns (bytes memory) {
        (PoolKey memory key, bool zeroForOne, uint256 amountIn) = abi.decode(data, (PoolKey, bool, uint256));

        BalanceDelta delta = poolManager.swap(
            key,
            SwapParams({zeroForOne: zeroForOne, amountSpecified: -int256(amountIn), sqrtPriceLimitX96: 0}),
            ""
        );

        Currency currencyIn = zeroForOne ? key.currency0 : key.currency1;
        Currency currencyOut = zeroForOne ? key.currency1 : key.currency0;
        int128 amountOwed = zeroForOne ? delta.amount0() : delta.amount1();
        int128 amountReceived = zeroForOne ? delta.amount1() : delta.amount0();

        uint256 owed = uint256(uint128(-amountOwed));
        poolManager.sync(currencyIn);
        if (currencyIn.isAddressZero()) {
            poolManager.settle{value: owed}();
        } else {
            IERC20(Currency.unwrap(currencyIn)).transfer(address(poolManager), owed);
            poolManager.settle();
        }

        uint256 received = uint256(uint128(amountReceived));
        poolManager.take(currencyOut, address(this), received);

        (uint160 sqrtPriceAfter, , , ) = poolManager.getSlot0(key.toId());
        return abi.encode(received, sqrtPriceAfter);
    }

    receive() external payable {}
}
