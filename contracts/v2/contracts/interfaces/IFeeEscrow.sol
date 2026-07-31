// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IFeeEscrow {
    event Credited(address indexed recipient, uint256 amount);
    event Claimed(address indexed recipient, uint256 amount);
    event CreditedToken(address indexed recipient, address indexed token, uint256 amount);
    event ClaimedToken(address indexed recipient, address indexed token, uint256 amount);

    /// @notice Credits native currency to `recipient`. Payable: caller forwards the value.
    function credit(address recipient) external payable;

    /// @notice Credits an ERC-20 balance to `recipient`. Caller must have already
    ///         transferred `amount` of `token` to the escrow.
    function creditToken(address recipient, address token, uint256 amount) external;

    function balanceOf(address recipient) external view returns (uint256);

    function balanceOfToken(address recipient, address token) external view returns (uint256);

    function claim() external;

    function claimToken(address token) external;
}
