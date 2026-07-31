// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Minimal basis-point math helper. 1 bps = 0.01%, so BPS_DENOMINATOR = 10_000.
library BpsMath {
    uint256 internal constant BPS_DENOMINATOR = 10_000;

    error BpsTooHigh(uint256 bps);

    function mulBps(uint256 amount, uint256 bps) internal pure returns (uint256) {
        return (amount * bps) / BPS_DENOMINATOR;
    }

    function checkBps(uint256 bps) internal pure {
        if (bps > BPS_DENOMINATOR) revert BpsTooHigh(bps);
    }
}
