// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ILaunchFactory} from "../interfaces/ILaunchFactory.sol";

/// @notice Test-only stand-in for LaunchFactory. Implements just enough of
///         ILaunchFactory for BondingCurve / BuybackVault unit tests to run
///         without pulling in the full graduation/Uniswap v4 flow.
contract MockFactory is ILaunchFactory {
    address public escrow;
    address public vault;
    mapping(address => LaunchedToken) public launches;
    mapping(address => FeePolicy) public policies;

    constructor(address creatorFeeRecipient, address protocolFeeRecipient) {
        // A default policy usable by any curve deployed against this mock.
        FeePolicy memory policy = FeePolicy({
            protocolFeeRecipient: protocolFeeRecipient,
            protocolFeeShareBps: 3000,
            buybackBurnBps: 5000,
            hookFeeBps: 100,
            maxInternalPriceImpactBps: 300
        });
        _defaultCreator = creatorFeeRecipient;
        _defaultPolicy = policy;
    }

    address private _defaultCreator;
    FeePolicy private _defaultPolicy;

    function setEscrowAndVault(address escrow_, address vault_) external {
        escrow = escrow_;
        vault = vault_;
    }

    /// @dev Call once per curve under test so `getLaunchedToken` /
    ///      `getLaunchFeePolicy` resolve sensibly for it.
    function registerCurve(address token, address curve) external {
        launches[token] = LaunchedToken({
            token: token,
            curve: curve,
            deployer: msg.sender,
            creatorFeeRecipient: _defaultCreator,
            pairToken: address(0),
            graduationThreshold: 0,
            poolFee: 0,
            tickSpacing: 60,
            creatorTaxBps: 0,
            buybackEnabled: false,
            phase: Phase.NotGraduated,
            sweptQuote: 0,
            sweptTokens: 0,
            sweptAt: 0,
            exists: true
        });
        policies[token] = _defaultPolicy;
    }

    function getLaunchedToken(address token) external view returns (LaunchedToken memory) {
        return launches[token];
    }

    function getLaunchFeePolicy(address token) external view returns (FeePolicy memory) {
        return policies[token];
    }

    function feeEscrow() external view returns (address) {
        return escrow;
    }

    function buybackVault() external view returns (address) {
        return vault;
    }

    function notifyCurveCompleted(address token, uint256 sweptQuote, uint256 sweptTokens) external {
        launches[token].phase = Phase.Swept;
        launches[token].sweptQuote = sweptQuote;
        launches[token].sweptTokens = sweptTokens;
        launches[token].sweptAt = block.timestamp;
    }

    /// @dev Deliberately reverts — the unit tests only exercise the curve up
    ///      to the point of graduation, not the real Uniswap v4 pool
    ///      creation flow, so BondingCurve's try/catch around this call is
    ///      expected to swallow the revert and emit AutoGraduationFailed.
    function createGraduatedPool(address) external pure {
        revert("MockFactory: pool creation not implemented");
    }
}
