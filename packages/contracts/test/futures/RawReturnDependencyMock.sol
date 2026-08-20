// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

contract RawReturnDependencyMock {
    enum Mode {
        Valid,
        Revert,
        Short,
        Overlong,
        Malformed
    }

    Mode public mode;

    function setMode(Mode mode_) external {
        mode = mode_;
    }

    fallback() external {
        Mode configured = mode;
        if (configured == Mode.Revert) {
            assembly ("memory-safe") {
                mstore(0, 0xdeadbeef)
                revert(28, 4)
            }
        }
        if (configured == Mode.Short) {
            assembly ("memory-safe") {
                mstore(0, 0xcafe)
                return(0, 31)
            }
        }
        if (configured == Mode.Overlong) {
            assembly ("memory-safe") {
                mstore(0, 0xcafe)
                mstore(32, 0xfeed)
                return(0, 64)
            }
        }
        if (configured == Mode.Malformed) {
            assembly ("memory-safe") {
                mstore(0, 2)
                return(0, 32)
            }
        }
        assembly ("memory-safe") {
            mstore(0, 0xcafe)
            return(0, 32)
        }
    }
}
