// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

contract FuturesCollateralMock {
    enum TransferMode {
        Standard,
        FalseReturn,
        FalseAfterTransfer,
        NoReturn,
        FeeOnTransfer,
        Reenter,
        MalformedReturn,
        ShortReturn,
        OverlongReturn,
        SenderFee,
        RecipientBonus,
        NegativeRebase
    }

    string public constant name = "Futures Collateral Mock";
    string public constant symbol = "fUSDT";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    uint16 public feeBps;
    TransferMode public transferMode;
    address public reentryTarget;
    bytes public reentryData;

    mapping(address account => uint256) public balanceOf;
    mapping(address owner => mapping(address spender => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function forceSlash(address account, uint256 amount) external {
        require(balanceOf[account] >= amount, "BALANCE");
        balanceOf[account] -= amount;
        totalSupply -= amount;
    }

    function setTransferMode(TransferMode mode) external {
        transferMode = mode;
    }

    function setFeeBps(uint16 feeBps_) external {
        require(feeBps_ <= 10_000, "FEE_BPS");
        feeBps = feeBps_;
    }

    function configureReentry(address target, bytes calldata data) external {
        reentryTarget = target;
        reentryData = data;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        return _transfer(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount)
        external
        returns (bool)
    {
        if (transferMode == TransferMode.FalseReturn) return false;
        uint256 approved = allowance[from][msg.sender];
        if (approved != type(uint256).max) {
            require(approved >= amount, "ALLOWANCE");
            allowance[from][msg.sender] = approved - amount;
        }
        return _transfer(from, to, amount);
    }

    function _transfer(address from, address to, uint256 amount)
        private
        returns (bool)
    {
        if (transferMode == TransferMode.FalseReturn) return false;
        uint256 fee = (amount * feeBps) / 10_000;
        uint256 senderDebit = transferMode == TransferMode.SenderFee
            ? amount + fee
            : amount;
        require(balanceOf[from] >= senderDebit, "BALANCE");
        balanceOf[from] -= senderDebit;

        if (transferMode == TransferMode.FeeOnTransfer) {
            balanceOf[to] += amount - fee;
            totalSupply -= fee;
        } else if (transferMode == TransferMode.SenderFee) {
            balanceOf[to] += amount;
            totalSupply -= fee;
        } else if (transferMode == TransferMode.RecipientBonus) {
            balanceOf[to] += amount + fee;
            totalSupply += fee;
        } else if (transferMode == TransferMode.NegativeRebase) {
            balanceOf[to] += amount;
            uint256 rebaseDebit = fee < balanceOf[from] ? fee : balanceOf[from];
            balanceOf[from] -= rebaseDebit;
            totalSupply -= rebaseDebit;
        } else {
            balanceOf[to] += amount;
        }

        if (transferMode == TransferMode.Reenter && reentryTarget != address(0)) {
            (bool success,) = reentryTarget.call(reentryData);
            require(success, "REENTRY");
        }

        if (transferMode == TransferMode.NoReturn) {
            assembly ("memory-safe") {
                return(0, 0)
            }
        }
        if (transferMode == TransferMode.MalformedReturn) {
            assembly ("memory-safe") {
                mstore(0, 2)
                return(0, 32)
            }
        }
        if (transferMode == TransferMode.ShortReturn) {
            assembly ("memory-safe") {
                mstore(0, 1)
                return(1, 31)
            }
        }
        if (transferMode == TransferMode.OverlongReturn) {
            assembly ("memory-safe") {
                mstore(0, 1)
                mstore(32, 0xbeef)
                return(0, 64)
            }
        }
        if (transferMode == TransferMode.FalseAfterTransfer) return false;
        return true;
    }
}
