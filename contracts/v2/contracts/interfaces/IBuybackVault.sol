// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IBuybackVault {
    event Locked(address indexed token, uint256 amount, uint256 newVestingStart);
    event Released(address indexed token, uint256 creatorAmount, uint256 protocolAmount);

    /// @notice Locks `amount` of `token` (already transferred to the vault) into the
    ///         five year vest, recomputing the weighted vesting start.
    function lock(address token, uint256 amount) external;

    /// @notice Permissionlessly releases whatever has vested, splitting it between
    ///         the current creator fee recipient and the protocol.
    function release(address token) external returns (uint256 released);

    function totalLocked(address token) external view returns (uint256);

    function totalReleased(address token) external view returns (uint256);

    function vestedAmount(address token) external view returns (uint256);

    function releasable(address token) external view returns (uint256);

    function vestingStart(address token) external view returns (uint256);

    function VESTING_DURATION() external view returns (uint256);
}
