// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface ILaunchToken is IERC20Minimal {
    function configureLaunch(address graduationAuthority, address liquidityPair)
        external;
    function unlockLiquidityPair() external;
}

interface IWBNB is IERC20Minimal {
    function deposit() external payable;
}
