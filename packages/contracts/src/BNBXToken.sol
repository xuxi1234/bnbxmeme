// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title BNBX clean, fixed-supply meme token
/// @notice No owner, proxy, mint, tax, blacklist, pause, or transfer limits.
contract BNBXToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;

    uint256 public totalSupply;
    mapping(address account => uint256 balance) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;

    address public launchManager;
    address public graduationAuthority;
    address public liquidityPair;
    bool public liquidityPairUnlocked;

    error InvalidReceiver();
    error InsufficientBalance();
    error InsufficientAllowance();
    error OnlyLaunchManager();
    error OnlyGraduationAuthority();
    error LaunchAlreadyConfigured();
    error LiquidityPairLocked();

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event LaunchConfigured(
        address indexed graduationAuthority,
        address indexed liquidityPair
    );
    event LiquidityPairUnlocked(address indexed liquidityPair);

    constructor(string memory name_, string memory symbol_, address launchManager_) {
        if (launchManager_ == address(0)) revert InvalidReceiver();
        name = name_;
        symbol = symbol_;
        launchManager = launchManager_;
        totalSupply = TOTAL_SUPPLY;
        balanceOf[launchManager_] = TOTAL_SUPPLY;
        emit Transfer(address(0), launchManager_, TOTAL_SUPPLY);
    }

    /// @notice One-time launch wiring. The factory permanently renounces its
    /// token role in the same creation transaction.
    function configureLaunch(address graduationAuthority_, address liquidityPair_)
        external
    {
        if (msg.sender != launchManager) revert OnlyLaunchManager();
        if (
            graduationAuthority_ == address(0) || liquidityPair_ == address(0)
        ) revert InvalidReceiver();
        if (graduationAuthority != address(0) || liquidityPair != address(0)) {
            revert LaunchAlreadyConfigured();
        }

        graduationAuthority = graduationAuthority_;
        liquidityPair = liquidityPair_;
        launchManager = address(0);
        emit LaunchConfigured(graduationAuthority_, liquidityPair_);
    }

    /// @notice The immutable per-token curve can only remove the temporary
    /// pair-transfer lock. It cannot mint, tax, pause, seize, or relock.
    function unlockLiquidityPair() external {
        if (msg.sender != graduationAuthority) revert OnlyGraduationAuthority();
        liquidityPairUnlocked = true;
        graduationAuthority = address(0);
        emit LiquidityPairUnlocked(liquidityPair);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 permitted = allowance[from][msg.sender];
        if (permitted != type(uint256).max) {
            if (permitted < amount) revert InsufficientAllowance();
            unchecked {
                allowance[from][msg.sender] = permitted - amount;
            }
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }

        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0)) revert InvalidReceiver();
        if (to == liquidityPair && !liquidityPairUnlocked) {
            revert LiquidityPairLocked();
        }
        uint256 balance = balanceOf[from];
        if (balance < amount) revert InsufficientBalance();

        unchecked {
            balanceOf[from] = balance - amount;
            balanceOf[to] += amount;
        }

        emit Transfer(from, to, amount);
    }
}
