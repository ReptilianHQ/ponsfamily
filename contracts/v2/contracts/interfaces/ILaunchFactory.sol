// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface ILaunchFactory {
    enum Phase {
        NotGraduated,
        Swept,
        PoolCreated,
        Rescued
    }

    struct LaunchedToken {
        address token;
        address curve;
        address deployer;
        address creatorFeeRecipient;
        address pairToken;
        uint256 graduationThreshold;
        uint24 poolFee;
        int24 tickSpacing;
        uint16 creatorTaxBps;
        bool buybackEnabled;
        Phase phase;
        uint256 sweptQuote;
        uint256 sweptTokens;
        uint256 sweptAt;
        bool exists;
    }

    /// @dev Splits the base trade fee. `buybackBurnBps` is the share of the base
    ///      fee routed into the buyback vault when buybacks are enabled — the
    ///      bought-back tokens are locked and vested, not literally burned; the
    ///      field name matches the public ABI so integrators can rely on it.
    struct FeePolicy {
        address protocolFeeRecipient;
        uint16 protocolFeeShareBps;
        uint16 buybackBurnBps;
        uint16 hookFeeBps;
        uint16 maxInternalPriceImpactBps;
    }

    event TokenLaunched(
        address indexed token,
        address indexed curve,
        address indexed deployer,
        address pairToken,
        uint256 launchConfigId,
        uint256 graduationThreshold
    );
    event LaunchSwept(address indexed token, uint256 sweptQuote, uint256 sweptTokens);
    event PoolGraduated(address indexed token, bytes32 indexed poolId, address indexed pool);
    event CreatorFeeRecipientChangeProposed(address indexed token, address indexed newRecipient, uint256 effectiveAt, uint256 expiresAt);
    event CreatorFeeRecipientUpdated(address indexed token, address indexed oldRecipient, address indexed newRecipient);
    event LaunchRescued(address indexed token, uint256 quoteReturned);

    function getLaunchedToken(address token) external view returns (LaunchedToken memory);

    function getLaunchFeePolicy(address token) external view returns (FeePolicy memory);

    function feeEscrow() external view returns (address);

    function buybackVault() external view returns (address);

    /// @notice Called once by a launch's own curve, the moment it sells out.
    ///         Records the swept amounts and flips the launch into the Swept phase.
    ///         Reverts if called by anything other than the launch's registered curve.
    function notifyCurveCompleted(address token, uint256 sweptQuote, uint256 sweptTokens) external;

    /// @notice Permissionless. Finishes graduation for a launch sitting in the
    ///         Swept phase by creating its Uniswap v4 pool and locking the position.
    function createGraduatedPool(address token) external;
}
