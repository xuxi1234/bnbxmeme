// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ClearingHouse } from "../src/futures/ClearingHouse.sol";
import { RiskEngine } from "../src/futures/RiskEngine.sol";
import { FuturesCollateralMock } from "./futures/FuturesCollateralMock.sol";

contract CallActor {
    function execute(address target, bytes calldata callData)
        external
        returns (bytes memory returnData)
    {
        bool success;
        (success, returnData) = target.call(callData);
        if (!success) {
            assembly ("memory-safe") {
                revert(add(returnData, 32), mload(returnData))
            }
        }
    }
}

contract ClearingHouseDeployer {
    function deploy(
        address collateral,
        address riskEngine,
        address orderBook,
        address safetyController,
        address revenueRecipient,
        uint256 totalLiabilityCap,
        uint256 accountEquityCap,
        uint256 matchedOpenInterestCap
    ) external returns (address deployed) {
        deployed = address(
            new ClearingHouse(
                collateral,
                riskEngine,
                orderBook,
                safetyController,
                revenueRecipient,
                totalLiabilityCap,
                accountEquityCap,
                matchedOpenInterestCap
            )
        );
    }
}

contract PredictedDependency { }

contract PredictedDependencyFactory {
    function predict(bytes32 salt) external view returns (address predicted) {
        bytes32 initCodeHash = keccak256(type(PredictedDependency).creationCode);
        predicted = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash)
                    )
                )
            )
        );
    }

    function deploy(bytes32 salt) external returns (address deployed) {
        deployed = address(new PredictedDependency{ salt: salt }());
    }
}

contract ClearingHouseTest {
    uint256 internal constant TOTAL_CAP = 100_000;
    uint256 internal constant ACCOUNT_CAP = 10_000;
    uint256 internal constant OPEN_INTEREST_CAP = 10_000;

    FuturesCollateralMock internal collateral;
    RiskEngine internal riskEngine;
    ClearingHouse internal clearingHouse;
    CallActor internal orderBook;
    CallActor internal safetyController;
    CallActor internal revenueRecipient;
    CallActor internal alice;
    CallActor internal bob;
    CallActor internal sponsor;
    CallActor internal liquidator;
    CallActor internal outsider;

    function setUp() public {
        collateral = new FuturesCollateralMock();
        riskEngine = new RiskEngine();
        orderBook = new CallActor();
        safetyController = new CallActor();
        revenueRecipient = new CallActor();
        alice = new CallActor();
        bob = new CallActor();
        sponsor = new CallActor();
        liquidator = new CallActor();
        outsider = new CallActor();

        clearingHouse = new ClearingHouse(
            address(collateral),
            address(riskEngine),
            address(orderBook),
            address(safetyController),
            address(revenueRecipient),
            TOTAL_CAP,
            ACCOUNT_CAP,
            OPEN_INTEREST_CAP
        );

        _mintAndApprove(alice, 200_000, clearingHouse);
        _mintAndApprove(bob, 200_000, clearingHouse);
        _mintAndApprove(sponsor, 200_000, clearingHouse);
        _mintAndApprove(liquidator, 200_000, clearingHouse);
        _mintAndApprove(outsider, 200_000, clearingHouse);
        collateral.mint(address(this), 200_000);
    }

    function testConstructorRejectsInvalidDependenciesAndCaps() public {
        ClearingHouseDeployer deployer = new ClearingHouseDeployer();
        bytes memory valid = abi.encodeCall(
            deployer.deploy,
            (
                address(collateral),
                address(riskEngine),
                address(orderBook),
                address(safetyController),
                address(revenueRecipient),
                TOTAL_CAP,
                ACCOUNT_CAP,
                OPEN_INTEREST_CAP
            )
        );
        _assertSucceeds(address(deployer), valid);

        _assertDeployReverts(
            deployer,
            address(0),
            address(riskEngine),
            address(orderBook),
            address(safetyController),
            address(revenueRecipient),
            TOTAL_CAP,
            ACCOUNT_CAP,
            OPEN_INTEREST_CAP
        );
        _assertDeployReverts(
            deployer,
            address(0xC011A7E),
            address(riskEngine),
            address(orderBook),
            address(safetyController),
            address(revenueRecipient),
            TOTAL_CAP,
            ACCOUNT_CAP,
            OPEN_INTEREST_CAP
        );
        _assertDeployReverts(
            deployer,
            address(collateral),
            address(0xBADC0DE),
            address(orderBook),
            address(safetyController),
            address(revenueRecipient),
            TOTAL_CAP,
            ACCOUNT_CAP,
            OPEN_INTEREST_CAP
        );
        _assertDeployReverts(
            deployer,
            address(collateral),
            address(riskEngine),
            address(0),
            address(safetyController),
            address(revenueRecipient),
            TOTAL_CAP,
            ACCOUNT_CAP,
            OPEN_INTEREST_CAP
        );
        _assertDeployReverts(
            deployer,
            address(collateral),
            address(riskEngine),
            address(orderBook),
            address(0),
            address(revenueRecipient),
            TOTAL_CAP,
            ACCOUNT_CAP,
            OPEN_INTEREST_CAP
        );
        _assertDeployReverts(
            deployer,
            address(collateral),
            address(riskEngine),
            address(orderBook),
            address(safetyController),
            address(0),
            TOTAL_CAP,
            ACCOUNT_CAP,
            OPEN_INTEREST_CAP
        );
        _assertDeployReverts(
            deployer,
            address(collateral),
            address(riskEngine),
            address(orderBook),
            address(safetyController),
            address(revenueRecipient),
            0,
            ACCOUNT_CAP,
            OPEN_INTEREST_CAP
        );
        _assertDeployReverts(
            deployer,
            address(collateral),
            address(riskEngine),
            address(orderBook),
            address(safetyController),
            address(revenueRecipient),
            TOTAL_CAP,
            0,
            OPEN_INTEREST_CAP
        );
        _assertDeployReverts(
            deployer,
            address(collateral),
            address(riskEngine),
            address(orderBook),
            address(safetyController),
            address(revenueRecipient),
            TOTAL_CAP,
            ACCOUNT_CAP,
            0
        );
    }

    function testConstructorAcceptsPredictedOrderBookAndControllerWithoutCode()
        public
    {
        PredictedDependencyFactory factory = new PredictedDependencyFactory();
        bytes32 orderSalt = keccak256("ORDER_BOOK");
        bytes32 controllerSalt = keccak256("SAFETY_CONTROLLER");
        address predictedOrder = factory.predict(orderSalt);
        address predictedController = factory.predict(controllerSalt);
        assert(predictedOrder.code.length == 0);
        assert(predictedController.code.length == 0);

        ClearingHouse predictedHouse = new ClearingHouse(
            address(collateral),
            address(riskEngine),
            predictedOrder,
            predictedController,
            address(revenueRecipient),
            TOTAL_CAP,
            ACCOUNT_CAP,
            OPEN_INTEREST_CAP
        );
        assert(predictedHouse.orderBook() == predictedOrder);
        assert(predictedHouse.safetyController() == predictedController);

        assert(factory.deploy(orderSalt) == predictedOrder);
        assert(factory.deploy(controllerSalt) == predictedController);
        assert(predictedOrder.code.length > 0);
        assert(predictedController.code.length > 0);
        assert(predictedHouse.orderBook() == predictedOrder);
        assert(predictedHouse.safetyController() == predictedController);
    }

    function testStandardAndNoReturnDepositsCreditExactAvailableLiability()
        public
    {
        uint256 aliceBefore = collateral.balanceOf(address(alice));
        _deposit(alice, clearingHouse, 500);
        assert(collateral.balanceOf(address(alice)) == aliceBefore - 500);
        assert(collateral.balanceOf(address(clearingHouse)) == 500);
        assert(clearingHouse.available(address(alice)) == 500);
        assert(clearingHouse.totalAvailable() == 500);
        assert(clearingHouse.totalLiabilities() == 500);

        collateral.setTransferMode(
            FuturesCollateralMock.TransferMode.NoReturn
        );
        uint256 bobBefore = collateral.balanceOf(address(bob));
        _deposit(bob, clearingHouse, 200);
        assert(collateral.balanceOf(address(bob)) == bobBefore - 200);
        assert(collateral.balanceOf(address(clearingHouse)) == 700);
        assert(clearingHouse.available(address(bob)) == 200);
        assert(clearingHouse.totalAvailable() == 700);
        assert(clearingHouse.totalLiabilities() == 700);
        _assertSolvent(clearingHouse);
    }

    function testDepositRejectsZeroCapsFalseMalformedAndDeltaMismatchAtomically()
        public
    {
        _assertActorReverts(
            alice,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.deposit, (0))
        );

        _deposit(alice, clearingHouse, ACCOUNT_CAP);
        _assertActorReverts(
            alice,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.deposit, (1))
        );
        assert(clearingHouse.available(address(alice)) == ACCOUNT_CAP);

        ClearingHouse liabilityBound = _freshHouse(100, 1_000, 1_000);
        _approve(alice, liabilityBound);
        _approve(bob, liabilityBound);
        _deposit(alice, liabilityBound, 100);
        _assertActorReverts(
            bob,
            address(liabilityBound),
            abi.encodeCall(liabilityBound.deposit, (1))
        );
        assert(liabilityBound.totalLiabilities() == 100);

        ClearingHouse adversarial = _freshHouse(TOTAL_CAP, ACCOUNT_CAP, 1_000);
        _approve(bob, adversarial);
        uint256 bobBefore = collateral.balanceOf(address(bob));
        FuturesCollateralMock.TransferMode[9] memory rejectedModes = [
            FuturesCollateralMock.TransferMode.FalseReturn,
            FuturesCollateralMock.TransferMode.FalseAfterTransfer,
            FuturesCollateralMock.TransferMode.MalformedReturn,
            FuturesCollateralMock.TransferMode.ShortReturn,
            FuturesCollateralMock.TransferMode.OverlongReturn,
            FuturesCollateralMock.TransferMode.FeeOnTransfer,
            FuturesCollateralMock.TransferMode.SenderFee,
            FuturesCollateralMock.TransferMode.RecipientBonus,
            FuturesCollateralMock.TransferMode.NegativeRebase
        ];
        collateral.setFeeBps(1_000);
        for (uint256 i = 0; i < rejectedModes.length; i += 1) {
            collateral.setTransferMode(rejectedModes[i]);
            _assertActorReverts(
                bob,
                address(adversarial),
                abi.encodeCall(adversarial.deposit, (100))
            );
            assert(collateral.balanceOf(address(bob)) == bobBefore);
            assert(collateral.balanceOf(address(adversarial)) == 0);
            assert(adversarial.available(address(bob)) == 0);
            assert(adversarial.totalLiabilities() == 0);
        }
    }

    function testDepositRejectsCrossFunctionReentryWithoutPartialTransferOrCredit()
        public
    {
        _deposit(alice, clearingHouse, 1_000);
        _deposit(bob, clearingHouse, 1_000);
        _open(
            clearingHouse,
            address(alice),
            address(bob),
            address(alice),
            200,
            200,
            300,
            3
        );
        uint256 sponsorBefore = collateral.balanceOf(address(sponsor));
        uint256 houseBefore = collateral.balanceOf(address(clearingHouse));
        collateral.setTransferMode(FuturesCollateralMock.TransferMode.Reenter);
        collateral.configureReentry(
            address(orderBook),
            abi.encodeCall(
                orderBook.execute,
                (
                    address(clearingHouse),
                    abi.encodeCall(
                        clearingHouse.allocateRoundingResidual,
                        (address(alice), 1)
                    )
                )
            )
        );
        _assertActorReverts(
            sponsor,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.deposit, (100))
        );
        assert(collateral.balanceOf(address(sponsor)) == sponsorBefore);
        assert(collateral.balanceOf(address(clearingHouse)) == houseBefore);
        assert(clearingHouse.available(address(sponsor)) == 0);
        assert(clearingHouse.lockedMargin(address(alice)) == 200);
        assert(clearingHouse.insuranceBalance() == 0);
        assert(clearingHouse.totalLiabilities() == 1_997);
    }

    function testStandardAndNoReturnWithdrawalsDebitOnlyCallerAvailable()
        public
    {
        uint256 aliceBefore = collateral.balanceOf(address(alice));
        _deposit(alice, clearingHouse, 500);
        _withdraw(alice, clearingHouse, 100);
        assert(clearingHouse.available(address(alice)) == 400);
        assert(clearingHouse.totalAvailable() == 400);
        assert(collateral.balanceOf(address(clearingHouse)) == 400);

        collateral.setTransferMode(
            FuturesCollateralMock.TransferMode.NoReturn
        );
        _withdraw(alice, clearingHouse, 50);
        assert(clearingHouse.available(address(alice)) == 350);
        assert(clearingHouse.totalAvailable() == 350);
        assert(clearingHouse.totalLiabilities() == 350);
        assert(collateral.balanceOf(address(clearingHouse)) == 350);
        assert(collateral.balanceOf(address(alice)) == aliceBefore - 350);
        _assertSolvent(clearingHouse);
    }

    function testWithdrawRejectsUnavailableAndAdversarialTransfersAtomically()
        public
    {
        _deposit(alice, clearingHouse, 500);
        _fundInsurance(sponsor, clearingHouse, 10);
        _assertActorReverts(
            bob,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.withdraw, (1))
        );
        _assertActorReverts(
            alice,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.withdraw, (0))
        );
        _assertActorReverts(
            alice,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.withdraw, (501))
        );

        uint256 houseBefore = collateral.balanceOf(address(clearingHouse));
        uint256 aliceBefore = collateral.balanceOf(address(alice));
        FuturesCollateralMock.TransferMode[9] memory rejectedModes = [
            FuturesCollateralMock.TransferMode.FalseReturn,
            FuturesCollateralMock.TransferMode.FalseAfterTransfer,
            FuturesCollateralMock.TransferMode.MalformedReturn,
            FuturesCollateralMock.TransferMode.ShortReturn,
            FuturesCollateralMock.TransferMode.OverlongReturn,
            FuturesCollateralMock.TransferMode.FeeOnTransfer,
            FuturesCollateralMock.TransferMode.SenderFee,
            FuturesCollateralMock.TransferMode.RecipientBonus,
            FuturesCollateralMock.TransferMode.NegativeRebase
        ];
        collateral.setFeeBps(1_000);
        for (uint256 i = 0; i < rejectedModes.length; i += 1) {
            collateral.setTransferMode(rejectedModes[i]);
            _assertActorReverts(
                alice,
                address(clearingHouse),
                abi.encodeCall(clearingHouse.withdraw, (100))
            );
            assert(clearingHouse.available(address(alice)) == 500);
            assert(clearingHouse.totalAvailable() == 500);
            assert(collateral.balanceOf(address(clearingHouse)) == houseBefore);
            assert(collateral.balanceOf(address(alice)) == aliceBefore);
        }

        collateral.setTransferMode(FuturesCollateralMock.TransferMode.Reenter);
        collateral.configureReentry(
            address(orderBook),
            abi.encodeCall(
                orderBook.execute,
                (
                    address(clearingHouse),
                    abi.encodeCall(
                        clearingHouse.coverMatchedLossDeficit,
                        (address(bob), 1)
                    )
                )
            )
        );
        _assertActorReverts(
            alice,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.withdraw, (100))
        );
        assert(clearingHouse.available(address(alice)) == 500);
        assert(clearingHouse.lockedMargin(address(alice)) == 0);
        assert(clearingHouse.available(address(bob)) == 0);
        assert(clearingHouse.insuranceBalance() == 10);
        assert(collateral.balanceOf(address(clearingHouse)) == houseBefore);
        assert(collateral.balanceOf(address(alice)) == aliceBefore);
    }

    function testFundInsuranceIsExactCapBoundAndCreatesNoUserOrRevenueBalance()
        public
    {
        uint256 sponsorBefore = collateral.balanceOf(address(sponsor));
        _fundInsurance(sponsor, clearingHouse, 1_000);
        collateral.setTransferMode(
            FuturesCollateralMock.TransferMode.NoReturn
        );
        _fundInsurance(sponsor, clearingHouse, 100);
        assert(clearingHouse.insuranceBalance() == 1_100);
        assert(clearingHouse.available(address(sponsor)) == 0);
        assert(clearingHouse.claimable(address(sponsor)) == 0);
        assert(collateral.balanceOf(address(revenueRecipient)) == 0);
        assert(collateral.balanceOf(address(sponsor)) == sponsorBefore - 1_100);
        assert(collateral.balanceOf(address(clearingHouse)) == 1_100);
        assert(clearingHouse.totalLiabilities() == 1_100);

        collateral.setTransferMode(
            FuturesCollateralMock.TransferMode.FeeOnTransfer
        );
        collateral.setFeeBps(1_000);
        _assertActorReverts(
            sponsor,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.fundInsurance, (100))
        );
        assert(clearingHouse.insuranceBalance() == 1_100);
        assert(collateral.balanceOf(address(clearingHouse)) == 1_100);

        collateral.setTransferMode(FuturesCollateralMock.TransferMode.Standard);
        ClearingHouse capped = _freshHouse(100, 1_000, 1_000);
        _approve(sponsor, capped);
        _fundInsurance(sponsor, capped, 100);
        _assertActorReverts(
            sponsor,
            address(capped),
            abi.encodeCall(capped.fundInsurance, (1))
        );
        assert(capped.insuranceBalance() == 100);
        assert(capped.totalLiabilities() == 100);
    }

    function testPreexistingInsolvencyBlocksUserMoveDirectClaimAndController()
        public
    {
        ClearingHouse userHouse = _freshHouse(1_000, 100, 1_000);
        _approve(bob, userHouse);
        _approve(sponsor, userHouse);
        _deposit(bob, userHouse, 100);
        _fundInsurance(sponsor, userHouse, 10);
        _cover(userHouse, address(bob), 5);
        _withdraw(bob, userHouse, 1);
        assert(userHouse.available(address(bob)) == 99);
        assert(userHouse.claimable(address(bob)) == 5);
        assert(userHouse.insuranceBalance() == 5);
        assert(userHouse.totalLiabilities() == 109);
        assert(collateral.balanceOf(address(userHouse)) == 109);

        collateral.forceSlash(address(userHouse), 1);
        uint256 bobBefore = collateral.balanceOf(address(bob));
        _assertActorReverts(
            bob,
            address(userHouse),
            abi.encodeCall(userHouse.moveClaimableToAvailable, (1))
        );
        assert(userHouse.available(address(bob)) == 99);
        assert(userHouse.claimable(address(bob)) == 5);
        assert(userHouse.totalAvailable() == 99);
        assert(userHouse.totalClaimable() == 5);
        assert(userHouse.insuranceBalance() == 5);
        assert(userHouse.totalLiabilities() == 109);
        assert(collateral.balanceOf(address(userHouse)) == 108);

        _assertActorReverts(
            bob,
            address(userHouse),
            abi.encodeCall(userHouse.withdrawClaimable, (1))
        );
        assert(userHouse.available(address(bob)) == 99);
        assert(userHouse.claimable(address(bob)) == 5);
        assert(userHouse.totalAvailable() == 99);
        assert(userHouse.totalClaimable() == 5);
        assert(userHouse.insuranceBalance() == 5);
        assert(userHouse.totalLiabilities() == 109);
        assert(collateral.balanceOf(address(userHouse)) == 108);
        assert(collateral.balanceOf(address(bob)) == bobBefore);

        ClearingHouse controllerHouse = _freshHouse(1_000, 500, 1_000);
        _approve(alice, controllerHouse);
        _deposit(alice, controllerHouse, 100);
        collateral.forceSlash(address(controllerHouse), 1);
        _assertControllerReverts(
            controllerHouse,
            abi.encodeCall(controllerHouse.lowerTotalLiabilityCap, (999))
        );
        assert(controllerHouse.totalLiabilityCap() == 1_000);

        _assertControllerReverts(
            controllerHouse,
            abi.encodeCall(controllerHouse.lowerAccountEquityCap, (100))
        );
        assert(controllerHouse.accountEquityCap() == 500);

        _assertControllerReverts(
            controllerHouse,
            abi.encodeCall(
                controllerHouse.lowerMatchedOpenInterestCap, (999)
            )
        );
        assert(controllerHouse.matchedOpenInterestCap() == 1_000);
        assert(controllerHouse.available(address(alice)) == 100);
        assert(controllerHouse.totalAvailable() == 100);
        assert(controllerHouse.totalLockedMargin() == 0);
        assert(controllerHouse.matchedOpenInterest() == 0);
        assert(controllerHouse.totalLiabilities() == 100);
        assert(collateral.balanceOf(address(controllerHouse)) == 99);
    }

    function testPreexistingInsolvencyBlocksRewardMoveAndDirectWithdrawal()
        public
    {
        ClearingHouse rewardHouse = _freshHouse(10_000, 2_000, 1_000);
        _approve(alice, rewardHouse);
        _approve(bob, rewardHouse);
        _deposit(alice, rewardHouse, 1_000);
        _deposit(bob, rewardHouse, 1_000);
        _open(
            rewardHouse,
            address(alice),
            address(bob),
            address(alice),
            200,
            200,
            300,
            3
        );
        _penalty(
            rewardHouse,
            address(alice),
            address(liquidator),
            5,
            5
        );
        assert(rewardHouse.available(address(liquidator)) == 0);
        assert(rewardHouse.liquidationReward(address(liquidator)) == 4);
        assert(rewardHouse.insuranceBalance() == 1);
        assert(rewardHouse.totalLiabilities() == 1_997);
        assert(collateral.balanceOf(address(rewardHouse)) == 1_997);

        collateral.forceSlash(address(rewardHouse), 1);
        uint256 liquidatorBefore = collateral.balanceOf(address(liquidator));
        _assertActorReverts(
            liquidator,
            address(rewardHouse),
            abi.encodeCall(rewardHouse.moveLiquidationRewardToAvailable, (1))
        );
        assert(rewardHouse.available(address(liquidator)) == 0);
        assert(rewardHouse.liquidationReward(address(liquidator)) == 4);
        assert(rewardHouse.totalAvailable() == 1_597);
        assert(rewardHouse.totalLockedMargin() == 395);
        assert(rewardHouse.totalLiquidationRewards() == 4);
        assert(rewardHouse.insuranceBalance() == 1);
        assert(rewardHouse.totalLiabilities() == 1_997);
        assert(collateral.balanceOf(address(rewardHouse)) == 1_996);

        _assertActorReverts(
            liquidator,
            address(rewardHouse),
            abi.encodeCall(rewardHouse.withdrawLiquidationReward, (1))
        );
        assert(rewardHouse.available(address(liquidator)) == 0);
        assert(rewardHouse.liquidationReward(address(liquidator)) == 4);
        assert(rewardHouse.totalAvailable() == 1_597);
        assert(rewardHouse.totalLockedMargin() == 395);
        assert(rewardHouse.totalLiquidationRewards() == 4);
        assert(rewardHouse.insuranceBalance() == 1);
        assert(rewardHouse.totalLiabilities() == 1_997);
        assert(collateral.balanceOf(address(rewardHouse)) == 1_996);
        assert(collateral.balanceOf(address(liquidator)) == liquidatorBefore);
        assert(collateral.balanceOf(address(revenueRecipient)) == 3);
    }

    function testPreexistingInsolvencyBlocksOrderBookInternalReclassifications()
        public
    {
        ClearingHouse internalHouse = _freshHouse(10_000, 2_000, 1_000);
        _approve(alice, internalHouse);
        _approve(bob, internalHouse);
        _approve(sponsor, internalHouse);
        _deposit(alice, internalHouse, 1_000);
        _deposit(bob, internalHouse, 1_000);
        _fundInsurance(sponsor, internalHouse, 100);
        _open(
            internalHouse,
            address(alice),
            address(bob),
            address(alice),
            200,
            200,
            300,
            3
        );
        collateral.forceSlash(address(internalHouse), 1);

        _assertOrderReverts(
            internalHouse,
            abi.encodeCall(
                internalHouse.allocateRoundingResidual,
                (address(alice), 1)
            )
        );
        assert(internalHouse.lockedMargin(address(alice)) == 200);
        assert(internalHouse.insuranceBalance() == 100);

        _assertOrderReverts(
            internalHouse,
            abi.encodeCall(
                internalHouse.allocateLiquidationPenalty,
                (address(alice), address(liquidator), 5, 5)
            )
        );
        assert(internalHouse.lockedMargin(address(alice)) == 200);
        assert(internalHouse.liquidationReward(address(liquidator)) == 0);
        assert(internalHouse.insuranceBalance() == 100);

        _assertOrderReverts(
            internalHouse,
            abi.encodeCall(
                internalHouse.coverMatchedLossDeficit, (address(bob), 1)
            )
        );
        assert(internalHouse.available(address(alice)) == 797);
        assert(internalHouse.available(address(bob)) == 800);
        assert(internalHouse.lockedMargin(address(alice)) == 200);
        assert(internalHouse.lockedMargin(address(bob)) == 200);
        assert(internalHouse.totalAvailable() == 1_597);
        assert(internalHouse.totalLockedMargin() == 400);
        assert(internalHouse.totalLiquidationRewards() == 0);
        assert(internalHouse.insuranceBalance() == 100);
        assert(internalHouse.matchedOpenInterest() == 300);
        assert(internalHouse.totalLiabilities() == 2_097);
        assert(collateral.balanceOf(address(internalHouse)) == 2_096);
        assert(collateral.balanceOf(address(revenueRecipient)) == 3);
    }

    function testPreexistingInsolvencyBlocksInboundDepositAndInsuranceFunding()
        public
    {
        ClearingHouse depositHouse = _freshHouse(1_000, 500, 1_000);
        _approve(alice, depositHouse);
        _approve(bob, depositHouse);
        _deposit(alice, depositHouse, 100);
        collateral.forceSlash(address(depositHouse), 1);
        uint256 bobBefore = collateral.balanceOf(address(bob));
        _assertActorReverts(
            bob,
            address(depositHouse),
            abi.encodeCall(depositHouse.deposit, (10))
        );
        assert(depositHouse.available(address(alice)) == 100);
        assert(depositHouse.available(address(bob)) == 0);
        assert(depositHouse.totalAvailable() == 100);
        assert(depositHouse.insuranceBalance() == 0);
        assert(depositHouse.totalLiabilities() == 100);
        assert(collateral.balanceOf(address(depositHouse)) == 99);
        assert(collateral.balanceOf(address(bob)) == bobBefore);

        ClearingHouse insuranceHouse = _freshHouse(1_000, 500, 1_000);
        _approve(alice, insuranceHouse);
        _approve(sponsor, insuranceHouse);
        _deposit(alice, insuranceHouse, 100);
        collateral.forceSlash(address(insuranceHouse), 1);
        uint256 sponsorBefore = collateral.balanceOf(address(sponsor));
        _assertActorReverts(
            sponsor,
            address(insuranceHouse),
            abi.encodeCall(insuranceHouse.fundInsurance, (10))
        );
        assert(insuranceHouse.available(address(alice)) == 100);
        assert(insuranceHouse.totalAvailable() == 100);
        assert(insuranceHouse.insuranceBalance() == 0);
        assert(insuranceHouse.totalLiabilities() == 100);
        assert(collateral.balanceOf(address(insuranceHouse)) == 99);
        assert(collateral.balanceOf(address(sponsor)) == sponsorBefore);
    }

    function testPreexistingInsolvencyBlocksOutboundAvailableWithdrawal()
        public
    {
        ClearingHouse withdrawalHouse = _freshHouse(1_000, 500, 1_000);
        _approve(alice, withdrawalHouse);
        _deposit(alice, withdrawalHouse, 100);
        collateral.forceSlash(address(withdrawalHouse), 1);
        uint256 aliceBefore = collateral.balanceOf(address(alice));
        _assertActorReverts(
            alice,
            address(withdrawalHouse),
            abi.encodeCall(withdrawalHouse.withdraw, (10))
        );
        assert(withdrawalHouse.available(address(alice)) == 100);
        assert(withdrawalHouse.totalAvailable() == 100);
        assert(withdrawalHouse.totalLiabilities() == 100);
        assert(collateral.balanceOf(address(withdrawalHouse)) == 99);
        assert(collateral.balanceOf(address(alice)) == aliceBefore);
    }

    function testPreexistingInsolvencyBlocksFeeBearingOpenAndClose()
        public
    {
        ClearingHouse openHouse = _freshHouse(10_000, 2_000, 1_000);
        _approve(alice, openHouse);
        _approve(bob, openHouse);
        _deposit(alice, openHouse, 1_000);
        _deposit(bob, openHouse, 1_000);
        collateral.forceSlash(address(openHouse), 1);
        ClearingHouse.OpenMatchedPairParams memory openParams = _openParams(
            address(alice), address(bob), address(alice), 200, 200, 300, 3
        );
        _assertOrderReverts(
            openHouse,
            abi.encodeCall(openHouse.openMatchedPair, (openParams))
        );
        assert(openHouse.available(address(alice)) == 1_000);
        assert(openHouse.available(address(bob)) == 1_000);
        assert(openHouse.lockedMargin(address(alice)) == 0);
        assert(openHouse.lockedMargin(address(bob)) == 0);
        assert(openHouse.totalAvailable() == 2_000);
        assert(openHouse.totalLockedMargin() == 0);
        assert(openHouse.matchedOpenInterest() == 0);
        assert(openHouse.totalLiabilities() == 2_000);
        assert(collateral.balanceOf(address(openHouse)) == 1_999);
        assert(collateral.balanceOf(address(revenueRecipient)) == 0);

        ClearingHouse closeHouse = _freshHouse(10_000, 3_000, 2_000);
        _approve(alice, closeHouse);
        _approve(bob, closeHouse);
        _deposit(alice, closeHouse, 2_000);
        _deposit(bob, closeHouse, 2_000);
        _open(
            closeHouse,
            address(alice),
            address(bob),
            address(alice),
            500,
            500,
            1_000,
            10
        );
        collateral.forceSlash(address(closeHouse), 1);
        ClearingHouse.CloseMatchedPairParams memory closeParams =
            _closeParams(
                address(alice),
                address(bob),
                address(alice),
                address(bob),
                200,
                200,
                50,
                400,
                4
            );
        _assertOrderReverts(
            closeHouse,
            abi.encodeCall(closeHouse.closeMatchedPair, (closeParams))
        );
        assert(closeHouse.available(address(alice)) == 1_490);
        assert(closeHouse.available(address(bob)) == 1_500);
        assert(closeHouse.lockedMargin(address(alice)) == 500);
        assert(closeHouse.lockedMargin(address(bob)) == 500);
        assert(closeHouse.totalAvailable() == 2_990);
        assert(closeHouse.totalLockedMargin() == 1_000);
        assert(closeHouse.totalClaimable() == 0);
        assert(closeHouse.insuranceBalance() == 0);
        assert(closeHouse.matchedOpenInterest() == 1_000);
        assert(closeHouse.totalLiabilities() == 3_990);
        assert(collateral.balanceOf(address(closeHouse)) == 3_989);
        assert(collateral.balanceOf(address(revenueRecipient)) == 10);
    }

    function testOpenPairLocksBothMarginsCountsNotionalOnceAndPaysOneExactFee()
        public
    {
        _deposit(alice, clearingHouse, 1_000);
        _deposit(bob, clearingHouse, 1_000);
        _open(clearingHouse, address(alice), address(bob), address(alice), 200, 150, 300, 3);

        assert(clearingHouse.available(address(alice)) == 797);
        assert(clearingHouse.lockedMargin(address(alice)) == 200);
        assert(clearingHouse.available(address(bob)) == 850);
        assert(clearingHouse.lockedMargin(address(bob)) == 150);
        assert(clearingHouse.totalAvailable() == 1_647);
        assert(clearingHouse.totalLockedMargin() == 350);
        assert(clearingHouse.matchedOpenInterest() == 300);
        assert(clearingHouse.totalLiabilities() == 1_997);
        assert(collateral.balanceOf(address(clearingHouse)) == 1_997);
        assert(collateral.balanceOf(address(revenueRecipient)) == 3);
        _assertSolvent(clearingHouse);
    }

    function testOpenPairShortTakerDebitsOnlyShortAvailableAndPaysExactFee()
        public
    {
        _deposit(alice, clearingHouse, 1_000);
        _deposit(bob, clearingHouse, 1_000);
        _open(
            clearingHouse,
            address(alice),
            address(bob),
            address(bob),
            200,
            150,
            300,
            3
        );

        assert(clearingHouse.available(address(alice)) == 800);
        assert(clearingHouse.lockedMargin(address(alice)) == 200);
        assert(clearingHouse.claimable(address(alice)) == 0);
        assert(clearingHouse.available(address(bob)) == 847);
        assert(clearingHouse.lockedMargin(address(bob)) == 150);
        assert(clearingHouse.claimable(address(bob)) == 0);
        assert(clearingHouse.totalAvailable() == 1_647);
        assert(clearingHouse.totalLockedMargin() == 350);
        assert(clearingHouse.totalClaimable() == 0);
        assert(clearingHouse.matchedOpenInterest() == 300);
        assert(clearingHouse.totalLiabilities() == 1_997);
        assert(collateral.balanceOf(address(clearingHouse)) == 1_997);
        assert(collateral.balanceOf(address(revenueRecipient)) == 3);
        _assertSolvent(clearingHouse);
    }

    function testOpenPairRejectsUnauthorizedInvalidInsufficientAndOverCapCalls()
        public
    {
        _deposit(alice, clearingHouse, 5_000);
        _deposit(bob, clearingHouse, 5_000);
        ClearingHouse.OpenMatchedPairParams memory valid = _openParams(
            address(alice), address(bob), address(alice), 200, 200, 300, 3
        );
        _assertActorReverts(
            outsider,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.openMatchedPair, (valid))
        );

        ClearingHouse.OpenMatchedPairParams memory sameTrader = _openParams(
            address(alice), address(alice), address(alice), 200, 200, 300, 3
        );
        _assertOrderReverts(clearingHouse, abi.encodeCall(clearingHouse.openMatchedPair, (sameTrader)));
        ClearingHouse.OpenMatchedPairParams memory wrongTaker = _openParams(
            address(alice), address(bob), address(outsider), 200, 200, 300, 3
        );
        _assertOrderReverts(clearingHouse, abi.encodeCall(clearingHouse.openMatchedPair, (wrongTaker)));
        ClearingHouse.OpenMatchedPairParams memory zeroNotional = _openParams(
            address(alice), address(bob), address(alice), 200, 200, 0, 0
        );
        _assertOrderReverts(clearingHouse, abi.encodeCall(clearingHouse.openMatchedPair, (zeroNotional)));
        ClearingHouse.OpenMatchedPairParams memory lowMargin = _openParams(
            address(alice), address(bob), address(alice), 100, 200, 300, 3
        );
        _assertOrderReverts(clearingHouse, abi.encodeCall(clearingHouse.openMatchedPair, (lowMargin)));
        ClearingHouse.OpenMatchedPairParams memory wrongFee = _openParams(
            address(alice), address(bob), address(alice), 200, 200, 300, 2
        );
        _assertOrderReverts(clearingHouse, abi.encodeCall(clearingHouse.openMatchedPair, (wrongFee)));
        ClearingHouse.OpenMatchedPairParams memory insufficient = _openParams(
            address(alice), address(bob), address(alice), 4_998, 200, 300, 3
        );
        _assertOrderReverts(clearingHouse, abi.encodeCall(clearingHouse.openMatchedPair, (insufficient)));
        assert(clearingHouse.matchedOpenInterest() == 0);
        assert(clearingHouse.totalLockedMargin() == 0);
        assert(clearingHouse.totalAvailable() == 10_000);
        assert(collateral.balanceOf(address(revenueRecipient)) == 0);

        ClearingHouse oiBound = _freshHouse(10_000, 1_000, 300);
        _approve(alice, oiBound);
        _approve(bob, oiBound);
        _deposit(alice, oiBound, 500);
        _deposit(bob, oiBound, 500);
        ClearingHouse.OpenMatchedPairParams memory overOi = _openParams(
            address(alice), address(bob), address(alice), 101, 101, 301, 4
        );
        _assertOrderReverts(oiBound, abi.encodeCall(oiBound.openMatchedPair, (overOi)));
        assert(oiBound.matchedOpenInterest() == 0);
        assert(oiBound.totalLockedMargin() == 0);
        assert(oiBound.totalAvailable() == 1_000);
    }

    function testOpenPairFeeTransferFailureRollsBackEveryBalanceAndOpenInterest()
        public
    {
        _deposit(alice, clearingHouse, 1_000);
        _deposit(bob, clearingHouse, 1_000);
        collateral.setTransferMode(
            FuturesCollateralMock.TransferMode.FeeOnTransfer
        );
        collateral.setFeeBps(5_000);
        ClearingHouse.OpenMatchedPairParams memory params = _openParams(
            address(alice), address(bob), address(alice), 200, 150, 300, 3
        );
        _assertOrderReverts(
            clearingHouse, abi.encodeCall(clearingHouse.openMatchedPair, (params))
        );
        assert(clearingHouse.available(address(alice)) == 1_000);
        assert(clearingHouse.available(address(bob)) == 1_000);
        assert(clearingHouse.lockedMargin(address(alice)) == 0);
        assert(clearingHouse.lockedMargin(address(bob)) == 0);
        assert(clearingHouse.matchedOpenInterest() == 0);
        assert(clearingHouse.totalLiabilities() == 2_000);
        assert(collateral.balanceOf(address(clearingHouse)) == 2_000);
        assert(collateral.balanceOf(address(revenueRecipient)) == 0);
    }

    function testClosePairLongWinIsZeroSumBeforeFeeAndUsesOnlyCloseProceeds()
        public
    {
        _deposit(alice, clearingHouse, 2_000);
        _deposit(bob, clearingHouse, 2_000);
        _open(clearingHouse, address(alice), address(bob), address(alice), 500, 500, 1_000, 10);
        _close(
            clearingHouse,
            address(alice),
            address(bob),
            address(alice),
            address(alice),
            200,
            200,
            50,
            400,
            4
        );

        assert(clearingHouse.available(address(alice)) == 1_736);
        assert(clearingHouse.lockedMargin(address(alice)) == 300);
        assert(clearingHouse.available(address(bob)) == 1_650);
        assert(clearingHouse.lockedMargin(address(bob)) == 300);
        assert(clearingHouse.totalAvailable() == 3_386);
        assert(clearingHouse.totalLockedMargin() == 600);
        assert(clearingHouse.totalClaimable() == 0);
        assert(clearingHouse.insuranceBalance() == 0);
        assert(clearingHouse.matchedOpenInterest() == 600);
        assert(clearingHouse.totalLiabilities() == 3_986);
        assert(collateral.balanceOf(address(clearingHouse)) == 3_986);
        assert(collateral.balanceOf(address(revenueRecipient)) == 14);
        _assertSolvent(clearingHouse);
    }

    function testClosePairShortTakerDebitsOnlyShortGeneratedProceeds()
        public
    {
        _deposit(alice, clearingHouse, 2_000);
        _deposit(bob, clearingHouse, 2_000);
        _open(
            clearingHouse,
            address(alice),
            address(bob),
            address(bob),
            500,
            500,
            1_000,
            10
        );
        _close(
            clearingHouse,
            address(alice),
            address(bob),
            address(alice),
            address(bob),
            200,
            200,
            50,
            400,
            4
        );

        assert(clearingHouse.available(address(alice)) == 1_750);
        assert(clearingHouse.lockedMargin(address(alice)) == 300);
        assert(clearingHouse.claimable(address(alice)) == 0);
        assert(clearingHouse.available(address(bob)) == 1_636);
        assert(clearingHouse.lockedMargin(address(bob)) == 300);
        assert(clearingHouse.claimable(address(bob)) == 0);
        assert(clearingHouse.totalAvailable() == 3_386);
        assert(clearingHouse.totalLockedMargin() == 600);
        assert(clearingHouse.totalClaimable() == 0);
        assert(clearingHouse.insuranceBalance() == 0);
        assert(clearingHouse.matchedOpenInterest() == 600);
        assert(clearingHouse.totalLiabilities() == 3_986);
        assert(collateral.balanceOf(address(clearingHouse)) == 3_986);
        assert(collateral.balanceOf(address(revenueRecipient)) == 14);
        _assertSolvent(clearingHouse);
    }

    function testClosePairShortWinSpillsOnlyReceiverExcessToClaimable()
        public
    {
        _deposit(alice, clearingHouse, 1_000);
        _deposit(bob, clearingHouse, 10_000);
        _open(clearingHouse, address(alice), address(bob), address(alice), 101, 101, 300, 3);
        _close(
            clearingHouse,
            address(alice),
            address(bob),
            address(bob),
            address(alice),
            101,
            101,
            50,
            300,
            3
        );

        assert(clearingHouse.available(address(alice)) == 944);
        assert(clearingHouse.lockedMargin(address(alice)) == 0);
        assert(clearingHouse.claimable(address(alice)) == 0);
        assert(clearingHouse.available(address(bob)) == 10_000);
        assert(clearingHouse.lockedMargin(address(bob)) == 0);
        assert(clearingHouse.claimable(address(bob)) == 50);
        assert(clearingHouse.totalAvailable() == 10_944);
        assert(clearingHouse.totalClaimable() == 50);
        assert(clearingHouse.matchedOpenInterest() == 0);
        assert(clearingHouse.insuranceBalance() == 0);
        assert(clearingHouse.totalLiabilities() == 10_994);
        assert(collateral.balanceOf(address(clearingHouse)) == 10_994);
        assert(collateral.balanceOf(address(revenueRecipient)) == 6);
    }

    function testClosePairRejectsExcessPnlAndFeeWithoutUsingUnrelatedAvailable()
        public
    {
        _deposit(alice, clearingHouse, 1_000);
        _deposit(bob, clearingHouse, 1_000);
        _open(clearingHouse, address(alice), address(bob), address(alice), 34, 34, 100, 1);
        ClearingHouse.CloseMatchedPairParams memory excessPnl = _closeParams(
            address(alice),
            address(bob),
            address(bob),
            address(alice),
            34,
            34,
            35,
            100,
            1
        );
        _assertOrderReverts(
            clearingHouse, abi.encodeCall(clearingHouse.closeMatchedPair, (excessPnl))
        );

        ClearingHouse.CloseMatchedPairParams memory noCloseProceeds = _closeParams(
            address(alice),
            address(bob),
            address(bob),
            address(alice),
            34,
            34,
            34,
            100,
            1
        );
        _assertOrderReverts(
            clearingHouse,
            abi.encodeCall(clearingHouse.closeMatchedPair, (noCloseProceeds))
        );
        assert(clearingHouse.available(address(alice)) == 965);
        assert(clearingHouse.lockedMargin(address(alice)) == 34);
        assert(clearingHouse.available(address(bob)) == 966);
        assert(clearingHouse.lockedMargin(address(bob)) == 34);
        assert(clearingHouse.matchedOpenInterest() == 100);
        assert(clearingHouse.insuranceBalance() == 0);
        assert(collateral.balanceOf(address(revenueRecipient)) == 1);
        assert(clearingHouse.totalLiabilities() == 1_999);
    }

    function testClosePairShortTakerRejectsFeeWithoutShortCloseProceeds()
        public
    {
        _deposit(alice, clearingHouse, 1_000);
        _deposit(bob, clearingHouse, 1_000);
        _open(
            clearingHouse,
            address(alice),
            address(bob),
            address(alice),
            34,
            34,
            100,
            1
        );
        ClearingHouse.CloseMatchedPairParams memory noShortCloseProceeds =
            _closeParams(
                address(alice),
                address(bob),
                address(alice),
                address(bob),
                34,
                34,
                34,
                100,
                1
            );
        _assertOrderRevertsWithSelector(
            clearingHouse,
            abi.encodeCall(clearingHouse.closeMatchedPair, (noShortCloseProceeds)),
            ClearingHouse.InsufficientCloseProceeds.selector
        );

        assert(clearingHouse.available(address(alice)) == 965);
        assert(clearingHouse.lockedMargin(address(alice)) == 34);
        assert(clearingHouse.claimable(address(alice)) == 0);
        assert(clearingHouse.available(address(bob)) == 966);
        assert(clearingHouse.lockedMargin(address(bob)) == 34);
        assert(clearingHouse.claimable(address(bob)) == 0);
        assert(clearingHouse.totalAvailable() == 1_931);
        assert(clearingHouse.totalLockedMargin() == 68);
        assert(clearingHouse.totalClaimable() == 0);
        assert(clearingHouse.insuranceBalance() == 0);
        assert(clearingHouse.matchedOpenInterest() == 100);
        assert(clearingHouse.totalLiabilities() == 1_999);
        assert(collateral.balanceOf(address(clearingHouse)) == 1_999);
        assert(collateral.balanceOf(address(revenueRecipient)) == 1);
        _assertSolvent(clearingHouse);
    }

    function testClosePairTransferFailureRollsBackReleasePnlFeeAndOpenInterest()
        public
    {
        _deposit(alice, clearingHouse, 2_000);
        _deposit(bob, clearingHouse, 2_000);
        _open(clearingHouse, address(alice), address(bob), address(alice), 500, 500, 1_000, 10);
        collateral.setTransferMode(
            FuturesCollateralMock.TransferMode.FeeOnTransfer
        );
        collateral.setFeeBps(5_000);
        ClearingHouse.CloseMatchedPairParams memory params = _closeParams(
            address(alice),
            address(bob),
            address(alice),
            address(bob),
            200,
            200,
            50,
            400,
            4
        );
        _assertOrderReverts(
            clearingHouse, abi.encodeCall(clearingHouse.closeMatchedPair, (params))
        );
        assert(clearingHouse.available(address(alice)) == 1_490);
        assert(clearingHouse.available(address(bob)) == 1_500);
        assert(clearingHouse.lockedMargin(address(alice)) == 500);
        assert(clearingHouse.lockedMargin(address(bob)) == 500);
        assert(clearingHouse.matchedOpenInterest() == 1_000);
        assert(clearingHouse.totalLiabilities() == 3_990);
        assert(collateral.balanceOf(address(clearingHouse)) == 3_990);
        assert(collateral.balanceOf(address(revenueRecipient)) == 10);
    }

    function testStandalonePenaltyCannotFullyDepleteOrStrandOpenInterest()
        public
    {
        _deposit(alice, clearingHouse, 1_000);
        _deposit(bob, clearingHouse, 1_000);
        _open(
            clearingHouse,
            address(alice),
            address(bob),
            address(alice),
            34,
            34,
            100,
            1
        );
        _assertOrderReverts(
            clearingHouse,
            abi.encodeCall(
                clearingHouse.allocateLiquidationPenalty,
                (address(alice), address(liquidator), 34, 34)
            )
        );
        assert(clearingHouse.lockedMargin(address(alice)) == 34);
        assert(clearingHouse.matchedOpenInterest() == 100);

        _penalty(
            clearingHouse,
            address(alice),
            address(liquidator),
            33,
            34
        );
        assert(clearingHouse.lockedMargin(address(alice)) == 1);
        assert(clearingHouse.lockedMargin(address(bob)) == 34);
        assert(clearingHouse.liquidationReward(address(liquidator)) == 26);
        assert(clearingHouse.insuranceBalance() == 7);
        assert(clearingHouse.matchedOpenInterest() == 100);
        assert(clearingHouse.totalLiabilities() == 1_999);
        assert(collateral.balanceOf(address(clearingHouse)) == 1_999);
        assert(collateral.balanceOf(address(revenueRecipient)) == 1);
        _assertSolvent(clearingHouse);
    }

    function testClaimableCanMoveWithinCapOrWithdrawDirectlyOnlyByItsOwner()
        public
    {
        _deposit(bob, clearingHouse, 10_000);
        _fundInsurance(sponsor, clearingHouse, 100);
        _cover(clearingHouse, address(bob), 50);
        assert(clearingHouse.available(address(bob)) == 10_000);
        assert(clearingHouse.claimable(address(bob)) == 50);
        assert(clearingHouse.insuranceBalance() == 50);

        _assertActorReverts(
            bob,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.moveClaimableToAvailable, (1))
        );
        _assertActorReverts(
            outsider,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.withdrawClaimable, (1))
        );

        uint256 bobBefore = collateral.balanceOf(address(bob));
        collateral.setTransferMode(
            FuturesCollateralMock.TransferMode.FeeOnTransfer
        );
        collateral.setFeeBps(1_000);
        _assertActorReverts(
            bob,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.withdrawClaimable, (20))
        );
        assert(clearingHouse.claimable(address(bob)) == 50);
        assert(collateral.balanceOf(address(bob)) == bobBefore);

        collateral.setTransferMode(FuturesCollateralMock.TransferMode.Standard);
        _execute(
            bob,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.withdrawClaimable, (20))
        );
        assert(clearingHouse.claimable(address(bob)) == 30);
        assert(collateral.balanceOf(address(bob)) == bobBefore + 20);
        _withdraw(bob, clearingHouse, 100);
        _execute(
            bob,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.moveClaimableToAvailable, (30))
        );
        assert(clearingHouse.available(address(bob)) == 9_930);
        assert(clearingHouse.claimable(address(bob)) == 0);
        assert(clearingHouse.totalClaimable() == 0);
        _assertSolvent(clearingHouse);
    }

    function testRoundingResidualMovesOnlySpecifiedLockedFundsToInsurance()
        public
    {
        _deposit(alice, clearingHouse, 1_000);
        _deposit(bob, clearingHouse, 1_000);
        _open(clearingHouse, address(alice), address(bob), address(alice), 200, 200, 300, 3);
        uint256 liabilitiesBefore = clearingHouse.totalLiabilities();
        _executeOrder(
            clearingHouse,
            abi.encodeCall(
                clearingHouse.allocateRoundingResidual,
                (address(alice), 1)
            )
        );
        assert(clearingHouse.lockedMargin(address(alice)) == 199);
        assert(clearingHouse.lockedMargin(address(bob)) == 200);
        assert(clearingHouse.totalLockedMargin() == 399);
        assert(clearingHouse.insuranceBalance() == 1);
        assert(clearingHouse.totalLiabilities() == liabilitiesBefore);
        _assertOrderReverts(
            clearingHouse,
            abi.encodeCall(
                clearingHouse.allocateRoundingResidual,
                (address(alice), 199)
            )
        );
        assert(clearingHouse.lockedMargin(address(alice)) == 199);
        assert(clearingHouse.insuranceBalance() == 1);
    }

    function testPenaltyCapsAtRemainingEquityAndRoundsResidualToInsurance()
        public
    {
        _deposit(alice, clearingHouse, 1_000);
        _deposit(bob, clearingHouse, 1_000);
        _open(clearingHouse, address(alice), address(bob), address(alice), 200, 200, 300, 3);
        uint256 liabilitiesBefore = clearingHouse.totalLiabilities();
        _penalty(clearingHouse, address(alice), address(liquidator), 7, 5);
        assert(clearingHouse.lockedMargin(address(alice)) == 195);
        assert(clearingHouse.liquidationReward(address(liquidator)) == 4);
        assert(clearingHouse.insuranceBalance() == 1);

        _penalty(clearingHouse, address(alice), address(liquidator), 7, 7);
        assert(clearingHouse.lockedMargin(address(alice)) == 188);
        assert(clearingHouse.liquidationReward(address(liquidator)) == 9);
        assert(clearingHouse.insuranceBalance() == 3);
        assert(clearingHouse.totalLockedMargin() == 388);
        assert(clearingHouse.totalLiquidationRewards() == 9);
        assert(clearingHouse.totalLiabilities() == liabilitiesBefore);

        _assertOrderReverts(
            clearingHouse,
            abi.encodeCall(
                clearingHouse.allocateLiquidationPenalty,
                (address(alice), address(liquidator), 500, 500)
            )
        );
        assert(clearingHouse.lockedMargin(address(alice)) == 188);
        assert(clearingHouse.liquidationReward(address(liquidator)) == 9);
        assert(clearingHouse.insuranceBalance() == 3);
    }

    function testLiquidationRewardCanMoveWithinCapOrWithdrawDirectlyByOwner()
        public
    {
        _deposit(alice, clearingHouse, 1_000);
        _deposit(bob, clearingHouse, 1_000);
        _deposit(liquidator, clearingHouse, 10_000);
        _open(clearingHouse, address(alice), address(bob), address(alice), 200, 200, 300, 3);
        _penalty(clearingHouse, address(alice), address(liquidator), 10, 10);
        assert(clearingHouse.liquidationReward(address(liquidator)) == 8);
        assert(clearingHouse.insuranceBalance() == 2);
        _assertActorReverts(
            liquidator,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.moveLiquidationRewardToAvailable, (1))
        );

        uint256 liquidatorBefore = collateral.balanceOf(address(liquidator));
        collateral.setTransferMode(FuturesCollateralMock.TransferMode.FalseReturn);
        _assertActorReverts(
            liquidator,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.withdrawLiquidationReward, (3))
        );
        assert(clearingHouse.liquidationReward(address(liquidator)) == 8);
        assert(collateral.balanceOf(address(liquidator)) == liquidatorBefore);

        collateral.setTransferMode(FuturesCollateralMock.TransferMode.Standard);
        _execute(
            liquidator,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.withdrawLiquidationReward, (3))
        );
        assert(clearingHouse.liquidationReward(address(liquidator)) == 5);
        assert(collateral.balanceOf(address(liquidator)) == liquidatorBefore + 3);
        _withdraw(liquidator, clearingHouse, 10);
        _execute(
            liquidator,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.moveLiquidationRewardToAvailable, (5))
        );
        assert(clearingHouse.available(address(liquidator)) == 9_995);
        assert(clearingHouse.liquidationReward(address(liquidator)) == 0);
        assert(clearingHouse.totalLiquidationRewards() == 0);
        _assertSolvent(clearingHouse);
    }

    function testInsuranceCoversOnlyExplicitDeficitWithAccountCapSpill()
        public
    {
        _deposit(bob, clearingHouse, 9_900);
        _fundInsurance(sponsor, clearingHouse, 200);
        uint256 liabilitiesBefore = clearingHouse.totalLiabilities();
        _cover(clearingHouse, address(bob), 150);
        assert(clearingHouse.available(address(bob)) == 10_000);
        assert(clearingHouse.claimable(address(bob)) == 50);
        assert(clearingHouse.insuranceBalance() == 50);
        assert(clearingHouse.totalAvailable() == 10_000);
        assert(clearingHouse.totalClaimable() == 50);
        assert(clearingHouse.totalLiabilities() == liabilitiesBefore);

        _assertOrderReverts(
            clearingHouse,
            abi.encodeCall(
                clearingHouse.coverMatchedLossDeficit, (address(bob), 51)
            )
        );
        _assertActorReverts(
            outsider,
            address(clearingHouse),
            abi.encodeCall(
                clearingHouse.coverMatchedLossDeficit, (address(outsider), 1)
            )
        );
        assert(clearingHouse.available(address(bob)) == 10_000);
        assert(clearingHouse.claimable(address(bob)) == 50);
        assert(clearingHouse.insuranceBalance() == 50);
        assert(clearingHouse.totalLiabilities() == liabilitiesBefore);
        _assertSolvent(clearingHouse);
    }

    function testSafetyControllerCanOnlyStrictlyLowerCapsAboveLiveUsage()
        public
    {
        _deposit(alice, clearingHouse, 1_000);
        _deposit(bob, clearingHouse, 2_000);
        _fundInsurance(sponsor, clearingHouse, 500);
        _open(clearingHouse, address(alice), address(bob), address(alice), 200, 200, 300, 3);
        assert(clearingHouse.totalLiabilities() == 3_497);
        assert(clearingHouse.totalAvailable() + clearingHouse.totalLockedMargin() == 2_997);
        assert(clearingHouse.matchedOpenInterest() == 300);

        _executeController(
            clearingHouse,
            abi.encodeCall(clearingHouse.lowerTotalLiabilityCap, (3_497))
        );
        _executeController(
            clearingHouse,
            abi.encodeCall(clearingHouse.lowerAccountEquityCap, (2_997))
        );
        _executeController(
            clearingHouse,
            abi.encodeCall(clearingHouse.lowerMatchedOpenInterestCap, (300))
        );
        assert(clearingHouse.totalLiabilityCap() == 3_497);
        assert(clearingHouse.accountEquityCap() == 2_997);
        assert(clearingHouse.matchedOpenInterestCap() == 300);

        _assertControllerReverts(
            clearingHouse,
            abi.encodeCall(clearingHouse.lowerTotalLiabilityCap, (3_497))
        );
        _assertControllerReverts(
            clearingHouse,
            abi.encodeCall(clearingHouse.lowerTotalLiabilityCap, (3_496))
        );
        _assertControllerReverts(
            clearingHouse,
            abi.encodeCall(clearingHouse.lowerAccountEquityCap, (2_996))
        );
        _assertControllerReverts(
            clearingHouse,
            abi.encodeCall(clearingHouse.lowerMatchedOpenInterestCap, (299))
        );
        _assertControllerReverts(
            clearingHouse,
            abi.encodeCall(clearingHouse.lowerMatchedOpenInterestCap, (0))
        );
        _assertActorReverts(
            outsider,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.lowerTotalLiabilityCap, (3_497))
        );

        _assertActorReverts(
            alice,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.deposit, (1))
        );
        _assertActorReverts(
            sponsor,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.fundInsurance, (1))
        );
        assert(clearingHouse.totalLiabilities() == 3_497);
        _assertSolvent(clearingHouse);
    }

    function testUnauthorizedWalletsCannotMutateMatchedAccountingOrOtherClaims()
        public
    {
        _deposit(alice, clearingHouse, 1_000);
        _deposit(bob, clearingHouse, 1_000);
        _fundInsurance(sponsor, clearingHouse, 100);
        ClearingHouse.OpenMatchedPairParams memory params = _openParams(
            address(alice), address(bob), address(alice), 200, 200, 300, 3
        );
        bytes memory openCall = abi.encodeCall(clearingHouse.openMatchedPair, (params));
        _assertActorReverts(alice, address(clearingHouse), openCall);
        _assertActorReverts(safetyController, address(clearingHouse), openCall);
        _assertActorReverts(revenueRecipient, address(clearingHouse), openCall);
        _assertActorReverts(
            revenueRecipient,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.withdraw, (1))
        );
        _assertActorReverts(
            sponsor,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.withdrawClaimable, (1))
        );
        _assertActorReverts(
            sponsor,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.withdrawLiquidationReward, (1))
        );
        assert(clearingHouse.available(address(alice)) == 1_000);
        assert(clearingHouse.available(address(bob)) == 1_000);
        assert(clearingHouse.totalLockedMargin() == 0);
        assert(clearingHouse.insuranceBalance() == 100);
        assert(clearingHouse.totalLiabilities() == 2_100);
        assert(collateral.balanceOf(address(revenueRecipient)) == 0);
    }

    function testForcedDonationIsOnlySurplusAndLongSequenceStaysSolvent()
        public
    {
        _deposit(alice, clearingHouse, 3_000);
        _assertSolvent(clearingHouse);
        _deposit(bob, clearingHouse, 3_000);
        _assertSolvent(clearingHouse);
        _deposit(liquidator, clearingHouse, 100);
        _assertSolvent(clearingHouse);
        _fundInsurance(sponsor, clearingHouse, 500);
        _assertSolvent(clearingHouse);

        require(collateral.transfer(address(clearingHouse), 77), "DONATION");
        assert(clearingHouse.totalLiabilities() == 6_600);
        assert(collateral.balanceOf(address(clearingHouse)) == 6_677);
        assert(clearingHouse.available(address(this)) == 0);
        _assertSolvent(clearingHouse);

        _open(clearingHouse, address(alice), address(bob), address(alice), 500, 500, 1_000, 10);
        _assertSolvent(clearingHouse);
        _executeOrder(
            clearingHouse,
            abi.encodeCall(
                clearingHouse.allocateRoundingResidual,
                (address(alice), 1)
            )
        );
        _assertSolvent(clearingHouse);
        _penalty(clearingHouse, address(bob), address(liquidator), 7, 7);
        _assertSolvent(clearingHouse);
        _cover(clearingHouse, address(alice), 50);
        _assertSolvent(clearingHouse);
        _close(
            clearingHouse,
            address(alice),
            address(bob),
            address(alice),
            address(bob),
            200,
            200,
            50,
            400,
            4
        );
        _assertSolvent(clearingHouse);
        _execute(
            liquidator,
            address(clearingHouse),
            abi.encodeCall(clearingHouse.moveLiquidationRewardToAvailable, (5))
        );
        _assertSolvent(clearingHouse);
        _withdraw(liquidator, clearingHouse, 2);
        _assertSolvent(clearingHouse);
        _withdraw(bob, clearingHouse, 100);
        _assertSolvent(clearingHouse);

        uint256 knownAvailable = clearingHouse.available(address(alice))
            + clearingHouse.available(address(bob))
            + clearingHouse.available(address(liquidator));
        uint256 knownLocked = clearingHouse.lockedMargin(address(alice))
            + clearingHouse.lockedMargin(address(bob));
        uint256 knownClaimable = clearingHouse.claimable(address(alice))
            + clearingHouse.claimable(address(bob));
        uint256 knownRewards = clearingHouse.liquidationReward(address(liquidator));
        assert(knownAvailable == clearingHouse.totalAvailable());
        assert(knownLocked == clearingHouse.totalLockedMargin());
        assert(knownClaimable == clearingHouse.totalClaimable());
        assert(knownRewards == clearingHouse.totalLiquidationRewards());
        assert(
            collateral.balanceOf(address(clearingHouse))
                == clearingHouse.totalLiabilities() + 77
        );
    }

    function testDeployedRuntimeRejectsFallbackReceiveAndForbiddenAuthority()
        public
    {
        assert(address(clearingHouse).code.length > 0);
        bytes4[11] memory forbiddenSelectors = [
            bytes4(0x8da5cb5b), // owner()
            bytes4(0xf2fde38b), // transferOwnership(address)
            bytes4(0x4f1ef286), // upgradeToAndCall(address,bytes)
            bytes4(0xb61d27f6), // execute(address,bytes)
            bytes4(0xf3fef3a3), // withdraw(address,uint256)
            bytes4(keccak256("withdrawInsurance(uint256)")),
            bytes4(keccak256("rescueToken(address,address,uint256)")),
            bytes4(keccak256("skim(address)")),
            bytes4(keccak256("setCollateral(address)")),
            bytes4(keccak256("setRevenueRecipient(address)")),
            bytes4(keccak256("selfDestruct(address)"))
        ];
        for (uint256 i = 0; i < forbiddenSelectors.length; i += 1) {
            (bool success,) = address(clearingHouse).call(
                abi.encodePacked(forbiddenSelectors[i], bytes32(0), bytes32(0))
            );
            assert(!success);
        }
        (bool emptySuccess,) = address(clearingHouse).call("");
        assert(!emptySuccess);
        (bool valueSuccess,) = address(clearingHouse).call{ value: 1 }("");
        assert(!valueSuccess);
    }

    function _freshHouse(uint256 totalCap, uint256 accountCap, uint256 oiCap)
        internal
        returns (ClearingHouse fresh)
    {
        fresh = new ClearingHouse(
            address(collateral),
            address(riskEngine),
            address(orderBook),
            address(safetyController),
            address(revenueRecipient),
            totalCap,
            accountCap,
            oiCap
        );
    }

    function _mintAndApprove(
        CallActor actor,
        uint256 amount,
        ClearingHouse house
    ) internal {
        collateral.mint(address(actor), amount);
        _approve(actor, house);
    }

    function _approve(CallActor actor, ClearingHouse house) internal {
        _execute(
            actor,
            address(collateral),
            abi.encodeCall(collateral.approve, (address(house), type(uint256).max))
        );
    }

    function _deposit(CallActor actor, ClearingHouse house, uint256 amount)
        internal
    {
        _execute(actor, address(house), abi.encodeCall(house.deposit, (amount)));
    }

    function _withdraw(CallActor actor, ClearingHouse house, uint256 amount)
        internal
    {
        _execute(actor, address(house), abi.encodeCall(house.withdraw, (amount)));
    }

    function _fundInsurance(
        CallActor actor,
        ClearingHouse house,
        uint256 amount
    ) internal {
        _execute(
            actor,
            address(house),
            abi.encodeCall(house.fundInsurance, (amount))
        );
    }

    function _open(
        ClearingHouse house,
        address longTrader,
        address shortTrader,
        address taker,
        uint256 longMargin,
        uint256 shortMargin,
        uint256 matchedNotional,
        uint256 takerFee
    ) internal {
        ClearingHouse.OpenMatchedPairParams memory params = _openParams(
            longTrader,
            shortTrader,
            taker,
            longMargin,
            shortMargin,
            matchedNotional,
            takerFee
        );
        _executeOrder(
            house, abi.encodeCall(house.openMatchedPair, (params))
        );
    }

    function _close(
        ClearingHouse house,
        address longTrader,
        address shortTrader,
        address winner,
        address taker,
        uint256 longMarginReleased,
        uint256 shortMarginReleased,
        uint256 pnlAmount,
        uint256 matchedNotionalReduction,
        uint256 takerFee
    ) internal {
        ClearingHouse.CloseMatchedPairParams memory params = _closeParams(
            longTrader,
            shortTrader,
            winner,
            taker,
            longMarginReleased,
            shortMarginReleased,
            pnlAmount,
            matchedNotionalReduction,
            takerFee
        );
        _executeOrder(
            house, abi.encodeCall(house.closeMatchedPair, (params))
        );
    }

    function _cover(ClearingHouse house, address beneficiary, uint256 amount)
        internal
    {
        _executeOrder(
            house,
            abi.encodeCall(house.coverMatchedLossDeficit, (beneficiary, amount))
        );
    }

    function _penalty(
        ClearingHouse house,
        address account,
        address rewardRecipient,
        uint256 requestedPenalty,
        uint256 remainingEquity
    ) internal {
        _executeOrder(
            house,
            abi.encodeCall(
                house.allocateLiquidationPenalty,
                (account, rewardRecipient, requestedPenalty, remainingEquity)
            )
        );
    }

    function _openParams(
        address longTrader,
        address shortTrader,
        address taker,
        uint256 longMargin,
        uint256 shortMargin,
        uint256 matchedNotional,
        uint256 takerFee
    ) internal pure returns (ClearingHouse.OpenMatchedPairParams memory params) {
        params = ClearingHouse.OpenMatchedPairParams({
            longTrader: longTrader,
            shortTrader: shortTrader,
            taker: taker,
            longMargin: longMargin,
            shortMargin: shortMargin,
            matchedNotional: matchedNotional,
            takerFee: takerFee
        });
    }

    function _closeParams(
        address longTrader,
        address shortTrader,
        address winner,
        address taker,
        uint256 longMarginReleased,
        uint256 shortMarginReleased,
        uint256 pnlAmount,
        uint256 matchedNotionalReduction,
        uint256 takerFee
    ) internal pure returns (ClearingHouse.CloseMatchedPairParams memory params) {
        params = ClearingHouse.CloseMatchedPairParams({
            longTrader: longTrader,
            shortTrader: shortTrader,
            winner: winner,
            taker: taker,
            longMarginReleased: longMarginReleased,
            shortMarginReleased: shortMarginReleased,
            pnlAmount: pnlAmount,
            matchedNotionalReduction: matchedNotionalReduction,
            takerFee: takerFee
        });
    }

    function _execute(
        CallActor actor,
        address target,
        bytes memory callData
    ) internal returns (bytes memory) {
        return actor.execute(target, callData);
    }

    function _executeOrder(ClearingHouse house, bytes memory callData)
        internal
        returns (bytes memory)
    {
        return orderBook.execute(address(house), callData);
    }

    function _executeController(ClearingHouse house, bytes memory callData)
        internal
        returns (bytes memory)
    {
        return safetyController.execute(address(house), callData);
    }

    function _assertOrderReverts(ClearingHouse house, bytes memory callData)
        internal
    {
        _assertActorReverts(orderBook, address(house), callData);
    }

    function _assertOrderRevertsWithSelector(
        ClearingHouse house,
        bytes memory callData,
        bytes4 expectedSelector
    ) internal {
        (bool success, bytes memory returnData) = address(orderBook).call(
            abi.encodeCall(orderBook.execute, (address(house), callData))
        );
        assert(!success);
        assert(returnData.length == 4);
        bytes4 actualSelector;
        assembly ("memory-safe") {
            actualSelector := mload(add(returnData, 32))
        }
        assert(actualSelector == expectedSelector);
    }

    function _assertControllerReverts(
        ClearingHouse house,
        bytes memory callData
    ) internal {
        _assertActorReverts(safetyController, address(house), callData);
    }

    function _assertActorReverts(
        CallActor actor,
        address target,
        bytes memory callData
    ) internal {
        (bool success,) = address(actor).call(
            abi.encodeCall(actor.execute, (target, callData))
        );
        assert(!success);
    }

    function _assertDeployReverts(
        ClearingHouseDeployer deployer,
        address collateral_,
        address riskEngine_,
        address orderBook_,
        address safetyController_,
        address revenueRecipient_,
        uint256 totalCap,
        uint256 accountCap,
        uint256 oiCap
    ) internal {
        (bool success,) = address(deployer).call(
            abi.encodeCall(
                deployer.deploy,
                (
                    collateral_,
                    riskEngine_,
                    orderBook_,
                    safetyController_,
                    revenueRecipient_,
                    totalCap,
                    accountCap,
                    oiCap
                )
            )
        );
        assert(!success);
    }

    function _assertSucceeds(address target, bytes memory callData) internal {
        (bool success,) = target.call(callData);
        assert(success);
    }

    function _assertSolvent(ClearingHouse house) internal view {
        uint256 liabilities = house.totalAvailable()
            + house.totalLockedMargin()
            + house.totalClaimable()
            + house.totalLiquidationRewards()
            + house.insuranceBalance();
        assert(house.totalLiabilities() == liabilities);
        assert(collateral.balanceOf(address(house)) >= liabilities);
        assert(house.totalLiabilities() <= house.totalLiabilityCap());
        assert(house.matchedOpenInterest() <= house.matchedOpenInterestCap());
    }
}
