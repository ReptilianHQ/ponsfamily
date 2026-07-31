// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// @title LaunchLocker
/// @notice Permanently holds each graduated pool's full-range liquidity
///         position, and any launch-token supply left over at graduation.
/// @dev This contract deliberately implements no withdrawal, no unlock
///      function, and no privileged wallet override of any kind — not for
///      the creator, and not for pons. That is a design choice, not an
///      oversight: it is what makes "the liquidity is locked forever" true
///      by construction rather than by promise. If pons's raw PoolManager
///      liquidity accounting is used (see LaunchFactory), a position simply
///      means "liquidity attributed to this contract's address inside the
///      pool manager" and there is no code path here that can ever call
///      `modifyLiquidity` with a negative delta to remove it. If a future
///      version wraps positions as ERC-721 (via a Uniswap v4 position
///      manager), this contract can still receive and hold that NFT — see
///      `onERC721Received` below — again with no matching transfer-out
///      function.
contract LaunchLocker is IERC721Receiver {
    using SafeERC20 for IERC20;

    error NotFactory();

    event ExcessSupplyLocked(address indexed token, uint256 amount);
    event PositionSeeded(address indexed pool, uint128 liquidity);

    address public immutable factory;
    IPoolManager public immutable poolManager;

    modifier onlyFactory() {
        if (msg.sender != factory) revert NotFactory();
        _;
    }

    constructor(address factory_, IPoolManager poolManager_) {
        factory = factory_;
        poolManager = poolManager_;
    }

    /// @notice Anyone may deposit leftover launch-token supply here at
    ///         graduation. There is no matching withdrawal.
    function lockExcessSupply(address token, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit ExcessSupplyLocked(token, amount);
    }

    /// @notice Called once by the factory at graduation. Mints the full-range
    ///         position directly through the raw PoolManager, with this
    ///         contract as the owning address in the pool's internal
    ///         accounting — there is deliberately no function anywhere in
    ///         this contract that could later call `modifyLiquidity` with a
    ///         negative delta against that same position to remove it.
    ///         `token0Amount`/`token1Amount` must already be held by this
    ///         contract (the factory transfers them in immediately before
    ///         calling this function).
    function seedPosition(
        PoolKey calldata key,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        uint256 token0Amount,
        uint256 token1Amount
    ) external onlyFactory {
        poolManager.unlock(
            abi.encode(key, tickLower, tickUpper, liquidity, token0Amount, token1Amount)
        );
        emit PositionSeeded(Currency.unwrap(key.currency0), liquidity);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "not pool manager");
        (
            PoolKey memory key,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 token0Amount,
            uint256 token1Amount
        ) = abi.decode(data, (PoolKey, int24, int24, uint128, uint256, uint256));

        (BalanceDelta delta, ) = poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: int256(uint256(liquidity)),
                salt: bytes32(0)
            }),
            ""
        );

        // A positive delta component means this contract owes the pool that
        // amount (principal for a freshly minted position is always owed).
        _settle(key.currency0, uint256(int256(-delta.amount0())), token0Amount);
        _settle(key.currency1, uint256(int256(-delta.amount1())), token1Amount);

        return "";
    }

    function _settle(Currency currency, uint256 owed, uint256 available) private {
        if (owed == 0) return;
        require(owed <= available, "insufficient seed amount");
        poolManager.sync(currency);
        if (Currency.unwrap(currency) == address(0)) {
            poolManager.settle{value: owed}();
        } else {
            IERC20(Currency.unwrap(currency)).safeTransfer(address(poolManager), owed);
            poolManager.settle();
        }
        // Any dust left over from rounding stays here; it is supply that
        // never leaves the locker either way.
    }

    /// @dev Accepts an incoming position NFT (e.g. from a Uniswap v4
    ///      PositionManager) and holds it forever. No corresponding
    ///      `safeTransferFrom`-out path exists anywhere in this contract.
    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {}
}
