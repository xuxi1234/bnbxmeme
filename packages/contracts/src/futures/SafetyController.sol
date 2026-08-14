// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ClearingHouse } from "./ClearingHouse.sol";
import { FuturesOracle } from "./FuturesOracle.sol";

contract SafetyController {
    error ZeroAddress();
    error DependencyHasNoCode();
    error DependencyMismatch();
    error InvalidRoleAlias();
    error Unauthorized();
    error ReopenNotQueued();
    error ReopenNotReady();
    error StaleReopen();

    uint256 private constant REOPEN_DELAY = 48 hours;

    address public immutable guardian;
    ClearingHouse public immutable clearingHouse;
    FuturesOracle public immutable oracle;

    uint256 public safetyEpoch;
    uint256 public queuedReopenEpoch;
    uint256 public reopenExecutableAt;

    constructor(
        address guardian_,
        address clearingHouse_,
        address oracle_
    ) {
        if (
            guardian_ == address(0) || clearingHouse_ == address(0)
                || oracle_ == address(0)
        ) revert ZeroAddress();
        if (
            guardian_ == address(this) || guardian_ == clearingHouse_
                || guardian_ == oracle_ || clearingHouse_ == oracle_
        ) revert InvalidRoleAlias();
        if (
            clearingHouse_.code.length == 0 || oracle_.code.length == 0
        ) revert DependencyHasNoCode();
        if (
            ClearingHouse(clearingHouse_).safetyController() != address(this)
                || FuturesOracle(oracle_).guardian() != address(this)
        ) revert DependencyMismatch();

        guardian = guardian_;
        clearingHouse = ClearingHouse(clearingHouse_);
        oracle = FuturesOracle(oracle_);
    }

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert Unauthorized();
        _;
    }

    function forceCloseOnly() external onlyGuardian {
        _incrementEpoch();
        oracle.forceCloseOnly();
    }

    function lowerTotalLiabilityCap(uint256 newCap) external onlyGuardian {
        _incrementEpoch();
        clearingHouse.lowerTotalLiabilityCap(newCap);
    }

    function lowerAccountEquityCap(uint256 newCap) external onlyGuardian {
        _incrementEpoch();
        clearingHouse.lowerAccountEquityCap(newCap);
    }

    function lowerMatchedOpenInterestCap(uint256 newCap)
        external
        onlyGuardian
    {
        _incrementEpoch();
        clearingHouse.lowerMatchedOpenInterestCap(newCap);
    }

    function lowerMaxDeviationBps(uint16 newBps) external onlyGuardian {
        _incrementEpoch();
        oracle.lowerMaxDeviationBps(newBps);
    }

    function queueReopen() external onlyGuardian {
        queuedReopenEpoch = safetyEpoch;
        reopenExecutableAt = block.timestamp + REOPEN_DELAY;
    }

    function executeReopen() external {
        uint256 executableAt = reopenExecutableAt;
        if (executableAt == 0) revert ReopenNotQueued();
        if (queuedReopenEpoch != safetyEpoch) revert StaleReopen();
        if (block.timestamp < executableAt) revert ReopenNotReady();

        delete queuedReopenEpoch;
        delete reopenExecutableAt;
        oracle.clearForcedClose();
    }

    function _incrementEpoch() private {
        safetyEpoch += 1;
    }
}
