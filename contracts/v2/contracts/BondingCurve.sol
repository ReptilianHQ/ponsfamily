// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {BpsMath} from "./libraries/BpsMath.sol";
import {ILaunchFactory} from "./interfaces/ILaunchFactory.sol";
import {IFeeEscrow} from "./interfaces/IFeeEscrow.sol";
import {IBuybackVault} from "./interfaces/IBuybackVault.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @title BondingCurve
/// @notice One curve per launch. Holds the launch token's entire circulating
///         supply until graduation and prices every pre-graduation trade.
///
/// @dev Pricing model — constant product with a virtual ("phantom") quote
///      reserve, no virtual token reserve:
///
///        k              = phantomQuote * totalSupply         (fixed at creation)
///        quoteReserve   = phantomQuote + realQuoteReserve     (x)
///        tokenReserve   = tokens still held by the curve      (y)
///        invariant      = quoteReserve * tokenReserve == k    (holds at every trade)
///
///      The curve opens at a non-zero price because phantomQuote > 0 raises the
///      x side from the very first trade. Graduation is reached exactly when
///      realQuoteReserve == graduationThreshold, which by the invariant is the
///      same moment tokenReserve falls to `reservedTokens`:
///
///        reservedTokens = totalSupply * phantomQuote / (phantomQuote + graduationThreshold)
///
///      so "quote raised vs threshold" and "tokens sold vs sellable supply" are
///      two views of the same number and always agree exactly.
contract BondingCurve is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using BpsMath for uint256;

    error CurveGraduated();
    error SlippageExceeded();
    error NativeValueMismatch();
    error UnexpectedNativeValue();
    error ZeroAmount();
    error NotFactory();

    event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee);
    event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee);
    event CurveBuyRefunded(address indexed buyer, uint256 refundedQuote);
    event CurveCompleted(uint256 sweptQuote, uint256 sweptTokens);
    event AutoGraduationFailed(address indexed token);
    event BuybackLocked(uint256 quoteSpent, uint256 tokensLocked);

    address public immutable factory;
    /// @notice The launch token this curve prices. Not set in the constructor:
    ///         the token's own constructor needs this curve's address (to mint
    ///         its supply straight to it), so the factory deploys the curve
    ///         first, then the token, then calls `initializeToken` once before
    ///         anything else can touch this curve. `notGraduated`-gated
    ///         functions additionally check it is set, so no trade can occur
    ///         on an uninitialized curve.
    address public token;
    /// @dev address(0) means the launch is priced in native ETH.
    address public immutable pairToken;
    uint8 public immutable pairDecimals;

    uint256 public immutable phantomQuote;
    uint256 public immutable graduationThreshold;
    uint256 public immutable k;
    uint256 public immutable reservedTokensAmount;

    /// @notice Base trade fee, charged on every buy and sell. Immutable for the
    ///         life of the launch.
    uint256 public immutable feeBps;
    /// @notice Optional creator tax on top of the base fee, capped by the
    ///         protocol at creation time and fixed thereafter.
    uint256 public immutable creatorTaxBps;
    bool public immutable buybackEnabled;

    // Fee split, snapshotted from the factory's policy at creation so a later
    // change to the protocol default cannot retroactively alter a live launch.
    address public immutable protocolFeeRecipient;
    uint256 public immutable protocolFeeShareBps;
    uint256 public immutable buybackShareBps;

    uint256 public realQuoteReserve;
    uint256 public tokenReserve;
    bool public graduated;

    modifier notGraduated() {
        if (graduated) revert CurveGraduated();
        require(token != address(0), "not initialized");
        _;
    }

    struct CurveConfig {
        address factory;
        address pairToken;
        uint8 pairDecimals;
        uint256 totalSupply;
        uint256 phantomQuote;
        uint256 graduationThreshold;
        uint256 feeBps;
        uint256 creatorTaxBps;
        bool buybackEnabled;
        address protocolFeeRecipient;
        uint256 protocolFeeShareBps;
        uint256 buybackShareBps;
    }

    constructor(CurveConfig memory cfg) {
        factory = cfg.factory;
        pairToken = cfg.pairToken;
        pairDecimals = cfg.pairDecimals;
        phantomQuote = cfg.phantomQuote;
        graduationThreshold = cfg.graduationThreshold;
        feeBps = cfg.feeBps;
        creatorTaxBps = cfg.creatorTaxBps;
        buybackEnabled = cfg.buybackEnabled;
        protocolFeeRecipient = cfg.protocolFeeRecipient;
        protocolFeeShareBps = cfg.protocolFeeShareBps;
        buybackShareBps = cfg.buybackShareBps;

        k = cfg.phantomQuote * cfg.totalSupply;
        reservedTokensAmount = (cfg.totalSupply * cfg.phantomQuote) / (cfg.phantomQuote + cfg.graduationThreshold);

        // The token contract mints the entire supply to this address at
        // deployment, so the curve opens already holding it.
        tokenReserve = cfg.totalSupply;
    }

    /// @notice Called exactly once by the factory, immediately after
    ///         deploying the LaunchToken that mints its supply to this curve.
    function initializeToken(address token_) external {
        if (msg.sender != factory) revert NotFactory();
        require(token == address(0), "already initialized");
        require(token_ != address(0), "zero token");
        token = token_;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function isNativeQuote() external view returns (bool) {
        return pairToken == address(0);
    }

    /// @notice Pricing reserve, including the phantom amount. Never withdrawable.
    function quoteReserve() public view returns (uint256) {
        return phantomQuote + realQuoteReserve;
    }

    /// @notice Tokens still buyable before the curve closes.
    function sellableTokens() public view returns (uint256) {
        return tokenReserve - reservedTokensAmount;
    }

    /// @notice Supply held back for the pool. Fixed at launch.
    function reservedTokens() external view returns (uint256) {
        return reservedTokensAmount;
    }

    function readyToGraduate() public view returns (bool) {
        return tokenReserve == reservedTokensAmount;
    }

    function getReserves() external view returns (uint256 quoteReserve_, uint256 tokenReserve_) {
        return (quoteReserve(), tokenReserve);
    }

    // ---------------------------------------------------------------------
    // Trading
    // ---------------------------------------------------------------------

    function buy(uint256 quoteIn, uint256 minTokensOut, address recipient)
        external
        payable
        nonReentrant
        notGraduated
        returns (uint256 tokensOut)
    {
        if (quoteIn == 0) revert ZeroAmount();
        _pullQuote(quoteIn);

        // Split fee + tax off the gross input; only the net amount moves the curve.
        uint256 grossFee = quoteIn.mulBps(feeBps);
        uint256 taxAmount = quoteIn.mulBps(creatorTaxBps);
        uint256 netIn = quoteIn - grossFee - taxAmount;

        uint256 x = quoteReserve();
        uint256 y = tokenReserve;

        // Clamp to the graduation threshold: a buy that would oversell the
        // curve is filled up to exactly what remains, and the excess quote
        // (principal only — fees are recomputed on what was actually used)
        // is refunded in the same transaction.
        uint256 maxNetIn = graduationThreshold - realQuoteReserve;
        uint256 refund;
        if (netIn > maxNetIn) {
            // Re-derive the gross amount that corresponds to exactly maxNetIn,
            // charging fee/tax only on the portion actually filled.
            uint256 usedGross = (maxNetIn * quoteIn) / netIn;
            refund = quoteIn - usedGross;
            grossFee = usedGross.mulBps(feeBps);
            taxAmount = usedGross.mulBps(creatorTaxBps);
            netIn = maxNetIn;
        }

        uint256 newX = x + netIn;
        uint256 newY = k / newX;
        tokensOut = y - newY;

        realQuoteReserve += netIn;
        tokenReserve = newY;

        if (tokensOut < minTokensOut) revert SlippageExceeded();

        _distributeFee(grossFee, taxAmount);

        if (refund > 0) {
            _pushQuote(msg.sender, refund);
            emit CurveBuyRefunded(msg.sender, refund);
        }

        IERC20(token).safeTransfer(recipient, tokensOut);
        emit CurveBuy(msg.sender, recipient, quoteIn - refund, tokensOut, grossFee + taxAmount);

        if (readyToGraduate()) {
            _completeAndTryGraduate();
        }
    }

    function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient)
        external
        nonReentrant
        notGraduated
        returns (uint256 quoteOut)
    {
        if (tokensIn == 0) revert ZeroAmount();
        IERC20(token).safeTransferFrom(msg.sender, address(this), tokensIn);

        uint256 x = quoteReserve();
        uint256 y = tokenReserve;

        uint256 newY = y + tokensIn;
        uint256 newX = k / newY;
        uint256 grossOut = x - newX;

        uint256 grossFee = grossOut.mulBps(feeBps);
        uint256 taxAmount = grossOut.mulBps(creatorTaxBps);
        quoteOut = grossOut - grossFee - taxAmount;

        if (quoteOut < minQuoteOut) revert SlippageExceeded();

        realQuoteReserve -= grossOut;
        tokenReserve = newY;

        _distributeFee(grossFee, taxAmount);
        _pushQuote(recipient, quoteOut);

        emit CurveSell(msg.sender, recipient, tokensIn, quoteOut, grossFee + taxAmount);
    }

    // ---------------------------------------------------------------------
    // Graduation
    // ---------------------------------------------------------------------

    /// @dev Called once, from whichever trade sells the last sellable token.
    ///      Marks the curve closed, tells the factory what it is holding, and
    ///      makes a best-effort attempt to finish graduation in the same
    ///      transaction. If that attempt runs out of gas or otherwise fails,
    ///      the launch is left in the Swept phase for anyone to finish later
    ///      via `ILaunchFactory.createGraduatedPool`.
    function _completeAndTryGraduate() private {
        graduated = true;
        emit CurveCompleted(realQuoteReserve, tokenReserve);

        ILaunchFactory(factory).notifyCurveCompleted(token, realQuoteReserve, tokenReserve);

        try ILaunchFactory(factory).createGraduatedPool(token) {
            // Pool created and locked within this same transaction.
        } catch {
            emit AutoGraduationFailed(token);
        }
    }

    /// @notice Called only by the factory, once, to pull the swept reserves
    ///         out of a completed curve while it seeds the graduation pool.
    function sweepForGraduation(address to) external returns (uint256 quoteAmt, uint256 tokenAmt) {
        if (msg.sender != factory) revert NotFactory();
        quoteAmt = realQuoteReserve;
        tokenAmt = tokenReserve;
        realQuoteReserve = 0;
        tokenReserve = 0;
        if (tokenAmt > 0) IERC20(token).safeTransfer(to, tokenAmt);
        if (quoteAmt > 0) _pushQuote(to, quoteAmt);
    }

    // ---------------------------------------------------------------------
    // Internal fee handling
    // ---------------------------------------------------------------------

    function _distributeFee(uint256 grossFee, uint256 taxAmount) private {
        uint256 protocolCut = grossFee.mulBps(protocolFeeShareBps);
        uint256 remainder = grossFee - protocolCut;

        uint256 buybackCut;
        if (buybackEnabled) {
            buybackCut = remainder.mulBps(buybackShareBps);
            remainder -= buybackCut;
        }

        uint256 creatorCut = remainder + taxAmount;
        address creatorRecipient = ILaunchFactory(factory).getLaunchedToken(token).creatorFeeRecipient;
        address escrow = ILaunchFactory(factory).feeEscrow();

        if (protocolCut > 0) _creditEscrow(escrow, protocolFeeRecipient, protocolCut);
        if (creatorCut > 0) _creditEscrow(escrow, creatorRecipient, creatorCut);
        if (buybackCut > 0) _executeBuyback(buybackCut);
    }

    function _creditEscrow(address escrow, address recipient, uint256 amount) private {
        if (pairToken == address(0)) {
            IFeeEscrow(escrow).credit{value: amount}(recipient);
        } else {
            IERC20(pairToken).forceApprove(escrow, amount);
            IFeeEscrow(escrow).creditToken(recipient, pairToken, amount);
        }
    }

    /// @dev Executes an internal buy of `quoteSpent` against the curve's own
    ///      reserves (no additional fee — this is a protocol operation, not a
    ///      user trade) and locks the resulting tokens in the buyback vault.
    ///      Cannot push the curve past graduation: a buyback is always funded
    ///      from a fee on a trade that itself already respected the threshold.
    function _executeBuyback(uint256 quoteSpent) private {
        uint256 x = quoteReserve();
        uint256 y = tokenReserve;
        uint256 newX = x + quoteSpent;
        uint256 newY = k / newX;
        uint256 tokensBought = y - newY;
        if (tokensBought == 0) return;

        realQuoteReserve += quoteSpent;
        tokenReserve = newY;

        address vault = ILaunchFactory(factory).buybackVault();
        IERC20(token).forceApprove(vault, tokensBought);
        IBuybackVault(vault).lock(token, tokensBought);

        emit BuybackLocked(quoteSpent, tokensBought);
    }

    function _pullQuote(uint256 amount) private {
        if (pairToken == address(0)) {
            if (msg.value != amount) revert NativeValueMismatch();
        } else {
            if (msg.value != 0) revert UnexpectedNativeValue();
            IERC20(pairToken).safeTransferFrom(msg.sender, address(this), amount);
        }
    }

    function _pushQuote(address to, uint256 amount) private {
        if (pairToken == address(0)) {
            (bool ok, ) = to.call{value: amount}("");
            require(ok, "native transfer failed");
        } else {
            IERC20(pairToken).safeTransfer(to, amount);
        }
    }

    receive() external payable {}
}
