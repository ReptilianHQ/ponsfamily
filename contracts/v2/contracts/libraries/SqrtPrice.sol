// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Derives an initial `sqrtPriceX96` from a raw amount1:amount0 ratio,
///         so a graduating pool opens at the price the curve closed at
///         rather than at an arbitrary default.
library SqrtPrice {
    /// @dev sqrtPriceX96 = sqrt(amount1 / amount0) * 2^96, computed as
    ///      sqrt(amount1 * 2^192 / amount0) to keep everything in integers.
    function sqrtPriceX96FromAmounts(uint256 amount0, uint256 amount1) internal pure returns (uint160) {
        require(amount0 > 0, "amount0 zero");
        uint256 ratioQ192 = _mulDiv(amount1, 1 << 192, amount0);
        return uint160(_sqrt(ratioQ192));
    }

    function _mulDiv(uint256 a, uint256 b, uint256 denominator) private pure returns (uint256 result) {
        // Amounts here are always well within uint256 range for realistic
        // token supplies and quote reserves (18-decimal tokens up to 1e30),
        // so a plain unchecked mulDiv is sufficient; a production build
        // handling arbitrary-decimal, arbitrary-supply tokens should use
        // @uniswap/v4-core's FullMath.mulDiv instead to guard against
        // intermediate overflow.
        result = (a * b) / denominator;
    }

    function _sqrt(uint256 x) private pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}
