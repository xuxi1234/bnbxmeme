// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title BNBX zero-tax fixed-supply token
/// @notice A non-upgradeable ERC-20 with no owner, mint, tax, blacklist,
/// pause, transfer limit, or asset-recovery function.
/// @dev The two temporary launch permissions are single-use and are
/// irreversibly assigned to DEAD after configuration and graduation.
contract BNBXZeroTaxToken {
    string public name;
    string public symbol;

    uint8 public constant decimals = 18;
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant totalSupply = TOTAL_SUPPLY;
    address public constant DEAD =
        0x000000000000000000000000000000000000dEaD;

    mapping(address account => uint256 balance) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount))
        public allowance;

    address public launchManager;
    address public graduationAuthority;
    address public liquidityPair;
    bool public liquidityPairUnlocked;

    error InvalidTokenIdentity();
    error InvalidAddress();
    error InsufficientBalance();
    error InsufficientAllowance();
    error OnlyLaunchManager();
    error OnlyGraduationAuthority();
    error LaunchAlreadyConfigured();
    error LiquidityPairLocked();

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(
        address indexed owner, address indexed spender, uint256 value
    );
    event LaunchConfigured(
        address indexed graduationAuthority, address indexed liquidityPair
    );
    event LiquidityPairUnlocked(address indexed liquidityPair);

    constructor(
        string memory name_,
        string memory symbol_,
        address launchManager_
    ) {
        uint256 nameLength = bytes(name_).length;
        uint256 symbolLength = bytes(symbol_).length;
        if (
            nameLength == 0 || nameLength > 128 || symbolLength == 0
                || symbolLength > 64
        ) revert InvalidTokenIdentity();
        if (launchManager_ == address(0) || launchManager_ == DEAD) {
            revert InvalidAddress();
        }

        name = name_;
        symbol = symbol_;
        launchManager = launchManager_;
        balanceOf[launchManager_] = TOTAL_SUPPLY;
        emit Transfer(address(0), launchManager_, TOTAL_SUPPLY);
    }

    /// @notice Binds this token to its immutable launch Curve and Pancake Pair.
    /// This permission is destroyed in the same transaction.
    function configureLaunch(
        address graduationAuthority_,
        address liquidityPair_
    ) external {
        if (msg.sender != launchManager) revert OnlyLaunchManager();
        if (
            graduationAuthority_ == address(0)
                || graduationAuthority_ == DEAD
                || liquidityPair_ == address(0) || liquidityPair_ == DEAD
                || graduationAuthority_ == liquidityPair_
                || graduationAuthority_.code.length == 0
                || liquidityPair_.code.length == 0
        ) revert InvalidAddress();
        if (graduationAuthority != address(0) || liquidityPair != address(0)) {
            revert LaunchAlreadyConfigured();
        }

        graduationAuthority = graduationAuthority_;
        liquidityPair = liquidityPair_;
        launchManager = DEAD;
        emit LaunchConfigured(graduationAuthority_, liquidityPair_);
    }

    /// @notice Permanently unlocks the pre-bound Pancake Pair at graduation.
    function unlockLiquidityPair() external {
        if (msg.sender != graduationAuthority) {
            revert OnlyGraduationAuthority();
        }
        liquidityPairUnlocked = true;
        graduationAuthority = DEAD;
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

    function transferFrom(address from, address to, uint256 amount)
        external
        returns (bool)
    {
        uint256 permitted = allowance[from][msg.sender];
        if (permitted != type(uint256).max) {
            if (permitted < amount) revert InsufficientAllowance();
            unchecked {
                permitted -= amount;
            }
            allowance[from][msg.sender] = permitted;
            emit Approval(from, msg.sender, permitted);
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0)) revert InvalidAddress();
        if (to == liquidityPair && !liquidityPairUnlocked) {
            revert LiquidityPairLocked();
        }

        uint256 fromBalance = balanceOf[from];
        if (fromBalance < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = fromBalance - amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }
}
