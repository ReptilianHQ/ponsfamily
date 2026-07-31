// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IFeeEscrow} from "./interfaces/IFeeEscrow.sol";

/// @title FeeEscrow
/// @notice Holds claimable protocol and creator balances in ETH and ERC-20.
/// @dev Fees are credited here rather than pushed to recipients. If payouts
///      were pushed automatically, a single recipient whose wallet cannot
///      accept a transfer (a contract without a receive function, a token
///      that reverts on transfer to it, etc.) would jam distribution for
///      every other recipient sharing the same sweep. Crediting a balance
///      that is withdrawn on the recipient's own schedule removes that
///      failure mode entirely.
contract FeeEscrow is IFeeEscrow, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    error NotAuthorized();
    error NothingToClaim();

    mapping(address => bool) public authorizedCreditors;
    mapping(address => uint256) private _nativeBalance;
    mapping(address => mapping(address => uint256)) private _tokenBalance;

    event CreditorAuthorized(address indexed creditor, bool authorized);

    modifier onlyAuthorized() {
        if (!authorizedCreditors[msg.sender]) revert NotAuthorized();
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice The factory, every curve it deploys, the meme hook, and the
    ///         buyback vault all need to credit this escrow. Rather than
    ///         re-deriving that set on every call, the owner (the factory
    ///         deployer / governance) authorizes each source once.
    function setAuthorized(address creditor, bool authorized) external onlyOwner {
        authorizedCreditors[creditor] = authorized;
        emit CreditorAuthorized(creditor, authorized);
    }

    function credit(address recipient) external payable onlyAuthorized {
        _nativeBalance[recipient] += msg.value;
        emit Credited(recipient, msg.value);
    }

    function creditToken(address recipient, address token, uint256 amount) external onlyAuthorized {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        _tokenBalance[recipient][token] += amount;
        emit CreditedToken(recipient, token, amount);
    }

    function balanceOf(address recipient) external view returns (uint256) {
        return _nativeBalance[recipient];
    }

    function balanceOfToken(address recipient, address token) external view returns (uint256) {
        return _tokenBalance[recipient][token];
    }

    function claim() external nonReentrant {
        uint256 amount = _nativeBalance[msg.sender];
        if (amount == 0) revert NothingToClaim();
        _nativeBalance[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "native transfer failed");
        emit Claimed(msg.sender, amount);
    }

    function claimToken(address token) external nonReentrant {
        uint256 amount = _tokenBalance[msg.sender][token];
        if (amount == 0) revert NothingToClaim();
        _tokenBalance[msg.sender][token] = 0;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit ClaimedToken(msg.sender, token, amount);
    }

    receive() external payable {}
}
