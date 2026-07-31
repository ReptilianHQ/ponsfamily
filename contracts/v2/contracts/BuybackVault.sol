// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IBuybackVault} from "./interfaces/IBuybackVault.sol";
import {IFeeEscrow} from "./interfaces/IFeeEscrow.sol";
import {ILaunchFactory} from "./interfaces/ILaunchFactory.sol";

/// @title BuybackVault
/// @notice Holds bought-back launch-token supply and releases it linearly
///         over five years, split between the creator and the protocol.
/// @dev Bought-back tokens are never burned. They sit here and vest slowly so
///      that no single buyback can put a large pile of tokens back into
///      circulation all at once. The vesting start is a running weighted
///      average, not the date of the first buyback: a large buyback made
///      today does not become withdrawable early just because a launch has
///      been buying back for years, and a launch's very first buyback does
///      not need to wait five years before anything releases either.
contract BuybackVault is IBuybackVault, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    error NotAuthorized();
    error NothingToRelease();

    uint256 public constant VESTING_DURATION = 5 * 365 days;

    address public immutable factory;
    address public immutable feeEscrow;

    mapping(address => bool) public authorizedLockers;
    mapping(address => uint256) public totalLocked;
    mapping(address => uint256) public totalReleased;
    mapping(address => uint256) public vestingStart;

    modifier onlyAuthorized() {
        if (!authorizedLockers[msg.sender]) revert NotAuthorized();
        _;
    }

    constructor(address initialOwner, address factory_, address feeEscrow_) Ownable(initialOwner) {
        factory = factory_;
        feeEscrow = feeEscrow_;
    }

    function setAuthorized(address locker, bool authorized) external onlyOwner {
        authorizedLockers[locker] = authorized;
    }

    /// @notice Locks `amount` of `token` (already transferred in by the caller)
    ///         into the vest, recomputing the weighted vesting start:
    ///
    ///           newStart = (lockedSoFar * oldStart + amount * now) / (lockedSoFar + amount)
    ///
    ///         so newly-added buybacks pull the effective start forward
    ///         proportionally to their size, rather than resetting or
    ///         inheriting the clock outright.
    function lock(address token, uint256 amount) external onlyAuthorized {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        uint256 locked = totalLocked[token];
        uint256 newStart;
        if (locked == 0) {
            newStart = block.timestamp;
        } else {
            newStart = (locked * vestingStart[token] + amount * block.timestamp) / (locked + amount);
        }

        vestingStart[token] = newStart;
        totalLocked[token] = locked + amount;

        emit Locked(token, amount, newStart);
    }

    function vestedAmount(address token) public view returns (uint256) {
        uint256 locked = totalLocked[token];
        if (locked == 0) return 0;

        uint256 start = vestingStart[token];
        if (block.timestamp <= start) return 0;

        uint256 elapsed = block.timestamp - start;
        if (elapsed >= VESTING_DURATION) return locked;

        return (locked * elapsed) / VESTING_DURATION;
    }

    function releasable(address token) public view returns (uint256) {
        uint256 vested = vestedAmount(token);
        uint256 released = totalReleased[token];
        return vested > released ? vested - released : 0;
    }

    /// @notice Permissionless. Splits whatever has newly vested between the
    ///         launch's current creator fee recipient and the protocol, and
    ///         credits both through the fee escrow so recovery follows the
    ///         same pull-based path as every other payout.
    function release(address token) external nonReentrant returns (uint256 released) {
        released = releasable(token);
        if (released == 0) revert NothingToRelease();

        totalReleased[token] += released;

        ILaunchFactory.FeePolicy memory policy = ILaunchFactory(factory).getLaunchFeePolicy(token);
        address creator = ILaunchFactory(factory).getLaunchedToken(token).creatorFeeRecipient;

        uint256 protocolAmount = (released * policy.protocolFeeShareBps) / 10_000;
        uint256 creatorAmount = released - protocolAmount;

        IERC20(token).forceApprove(feeEscrow, released);
        if (creatorAmount > 0) IFeeEscrow(feeEscrow).creditToken(creator, token, creatorAmount);
        if (protocolAmount > 0) IFeeEscrow(feeEscrow).creditToken(policy.protocolFeeRecipient, token, protocolAmount);

        emit Released(token, creatorAmount, protocolAmount);
    }
}
