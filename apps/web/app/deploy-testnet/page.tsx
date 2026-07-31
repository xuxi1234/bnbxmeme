"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isAddress, zeroAddress } from "viem";
import {
  useAccount,
  useChainId,
  useDeployContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { bsc, bscTestnet } from "wagmi/chains";
import { WalletButton } from "@/components/wallet-button";
import { useLanguage } from "@/components/language-provider";
import { deploymentCopy, interpolate } from "@/lib/localization-copy";
import {
  factoryDeploymentAbi,
  factoryDeploymentBytecode,
} from "@/lib/factory-deployment";
import {
  advancedTokenDeployerDeploymentAbi,
  advancedTokenDeployerDeploymentBytecode,
  rewardsFactoryDeploymentAbi,
  rewardsFactoryDeploymentBytecode,
} from "@/lib/rewards-factory-deployment";

const FEE_RECIPIENT = "0xdaf4f62914f7f64c9eabfd473f4db4b7e74048a6";
const AUTHORIZED_DEPLOYER = "0xbE37AB912De351B9312FA593C9f99e3279FDB0a2";
const PANCAKE_V2_TESTNET_ROUTER = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
const PANCAKE_V2_MAINNET_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const DEPLOYMENT_GAS_LIMIT = 8_000_000n;

function deploymentErrorMessage(
  error: Error,
  isMainnet: boolean,
  copy: (typeof deploymentCopy)["en"],
) {
  const message = error.message.toLowerCase();
  if (message.includes("user rejected") || message.includes("user denied")) {
    return copy.errorCancelled;
  }
  if (message.includes("insufficient funds")) {
    return isMainnet ? copy.errorMainnetFunds : copy.errorTestnetFunds;
  }
  if (message.includes("max code size exceeded")) {
    return copy.errorCodeSize;
  }
  return interpolate(copy.errorFailed, { message: error.message });
}

export default function DeployTestnetPage() {
  const { language } = useLanguage();
  const copy = deploymentCopy[language];
  const pathname = usePathname();
  const isMainnet = pathname.includes("mainnet");
  const activeChain = isMainnet ? bsc : bscTestnet;
  const pancakeRouter = isMainnet
    ? PANCAKE_V2_MAINNET_ROUTER
    : PANCAKE_V2_TESTNET_ROUTER;
  const [factoryType, setFactoryType] = useState<"standard" | "rewards">(
    "rewards",
  );
  const [resumedTokenDeployer, setResumedTokenDeployer] = useState<
    `0x${string}` | null
  >(null);
  const [resumedRewardsFactory, setResumedRewardsFactory] = useState<
    `0x${string}` | null
  >(null);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const standardDeployment = useDeployContract();
  const tokenDeployerDeployment = useDeployContract();
  const rewardsFactoryDeployment = useDeployContract();
  const managerConfiguration = useWriteContract();
  const standardReceipt = useWaitForTransactionReceipt({
    hash: standardDeployment.data,
  });
  const tokenDeployerReceipt = useWaitForTransactionReceipt({
    hash: tokenDeployerDeployment.data,
  });
  const rewardsFactoryReceipt = useWaitForTransactionReceipt({
    hash: rewardsFactoryDeployment.data,
  });
  const managerReceipt = useWaitForTransactionReceipt({
    hash: managerConfiguration.data,
  });
  const tokenDeployerAddress =
    tokenDeployerReceipt.data?.contractAddress ?? resumedTokenDeployer;
  const rewardsFactoryAddress =
    rewardsFactoryReceipt.data?.contractAddress ?? resumedRewardsFactory;
  const wrongChain = isConnected && chainId !== activeChain.id;
  const wrongSigner =
    isConnected && address?.toLowerCase() !== AUTHORIZED_DEPLOYER.toLowerCase();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deployer = params.get("deployer");
    const factory = params.get("factory");
    if (deployer && isAddress(deployer) && deployer !== zeroAddress) {
      setResumedTokenDeployer(deployer);
    }
    if (factory && isAddress(factory) && factory !== zeroAddress) {
      setResumedRewardsFactory(factory);
    }
  }, []);

  function deployStandardFactory() {
    if (!address || wrongSigner) return;
    standardDeployment.deployContract({
      abi: factoryDeploymentAbi,
      bytecode: factoryDeploymentBytecode,
      args: [FEE_RECIPIENT, pancakeRouter],
      chainId: activeChain.id,
      account: address,
      gas: DEPLOYMENT_GAS_LIMIT,
    });
  }

  function deployAdvancedTokenDeployer() {
    if (!address || wrongSigner) return;
    tokenDeployerDeployment.deployContract({
      abi: advancedTokenDeployerDeploymentAbi,
      bytecode: advancedTokenDeployerDeploymentBytecode,
      args: [address],
      chainId: activeChain.id,
      account: address,
      gas: DEPLOYMENT_GAS_LIMIT,
    });
  }

  function deployRewardsFactory() {
    if (!address || wrongSigner || !tokenDeployerAddress) return;
    rewardsFactoryDeployment.deployContract({
      abi: rewardsFactoryDeploymentAbi,
      bytecode: rewardsFactoryDeploymentBytecode,
      args: [FEE_RECIPIENT, pancakeRouter, tokenDeployerAddress],
      chainId: activeChain.id,
      account: address,
      gas: DEPLOYMENT_GAS_LIMIT,
    });
  }

  function configureRewardsFactory() {
    if (
      !address ||
      wrongSigner ||
      !tokenDeployerAddress ||
      !rewardsFactoryAddress
    )
      return;
    managerConfiguration.reset();
    managerConfiguration.writeContract({
      abi: advancedTokenDeployerDeploymentAbi,
      address: tokenDeployerAddress,
      functionName: "configureManager",
      args: [rewardsFactoryAddress],
      chainId: activeChain.id,
      account: address,
      gas: 150_000n,
    });
  }

  const currentError =
    factoryType !== "standard" && rewardsFactoryAddress
      ? managerConfiguration.error
      : (standardDeployment.error ??
        tokenDeployerDeployment.error ??
        rewardsFactoryDeployment.error);

  return (
    <main>
      <header className="topbar">
        <Link className="brand" href="/">
          BNBX
        </Link>
        <WalletButton />
      </header>
      <section className="form-shell">
        <p className="eyebrow">
          {isMainnet
            ? "MAINNET / V3 FACTORY DEPLOYMENT"
            : "TESTNET / FACTORY DEPLOYMENT"}
        </p>
        <h1 className="form-title">
          {isMainnet ? copy.titleMainnet : copy.titleTestnet}
        </h1>
        <p className="lead">
          {isMainnet ? copy.leadMainnet : copy.leadTestnet}
        </p>
        <div className="launch-form">
          <label>
            {copy.factoryType}
            <select
              value={factoryType}
              onChange={(event) =>
                setFactoryType(event.target.value as "standard" | "rewards")
              }
            >
              <option value="rewards">{copy.rewardsOption}</option>
              <option value="standard">{copy.standardOption}</option>
            </select>
          </label>
          <p className="notice">
            Fee Recipient：{FEE_RECIPIENT}
            <br />
            Pancake Router：{pancakeRouter}
          </p>
          {!isConnected ? (
            <p className="notice">
              {isMainnet
                ? copy.connectMainnetWallet
                : copy.connectTestnetWallet}
            </p>
          ) : wrongSigner ? (
            <p className="error">{copy.authorizedWalletOnly}</p>
          ) : wrongChain ? (
            <button
              className="button wide"
              type="button"
              onClick={() => switchChain({ chainId: activeChain.id })}
            >
              {isMainnet ? copy.switchMainnet : copy.switchTestnet}
            </button>
          ) : factoryType !== "standard" ? (
            <div className="stack">
              <p className="notice">{copy.advancedStepsHelp}</p>
              <button
                className="button wide"
                type="button"
                disabled={
                  tokenDeployerDeployment.isPending ||
                  tokenDeployerReceipt.isLoading ||
                  Boolean(tokenDeployerAddress)
                }
                onClick={deployAdvancedTokenDeployer}
              >
                {tokenDeployerAddress
                  ? copy.step1Done
                  : tokenDeployerDeployment.isPending
                    ? copy.step1Confirm
                    : tokenDeployerReceipt.isLoading
                      ? copy.step1Waiting
                      : copy.step1Deploy}
              </button>
              <button
                className="button wide"
                type="button"
                disabled={
                  !tokenDeployerAddress ||
                  rewardsFactoryDeployment.isPending ||
                  rewardsFactoryReceipt.isLoading ||
                  Boolean(rewardsFactoryAddress)
                }
                onClick={deployRewardsFactory}
              >
                {rewardsFactoryAddress
                  ? copy.step2Done
                  : rewardsFactoryDeployment.isPending
                    ? copy.step2Confirm
                    : rewardsFactoryReceipt.isLoading
                      ? copy.step2Waiting
                      : copy.step2Rewards}
              </button>
              <button
                className="button wide"
                type="button"
                disabled={
                  !rewardsFactoryAddress ||
                  managerConfiguration.isPending ||
                  managerReceipt.isLoading ||
                  managerReceipt.isSuccess
                }
                onClick={configureRewardsFactory}
              >
                {managerReceipt.isSuccess
                  ? copy.step3Done
                  : managerConfiguration.isPending
                    ? copy.step3Confirm
                    : managerReceipt.isLoading
                      ? copy.step3Waiting
                      : copy.step3Authorize}
              </button>
            </div>
          ) : (
            <button
              className="button wide"
              type="button"
              disabled={
                standardDeployment.isPending || standardReceipt.isLoading
              }
              onClick={deployStandardFactory}
            >
              {standardDeployment.isPending
                ? copy.confirmDeploy
                : standardReceipt.isLoading
                  ? isMainnet
                    ? copy.waitMainnet
                    : copy.waitTestnet
                  : copy.deployStandard}
            </button>
          )}
          {standardDeployment.data && (
            <p className="notice">
              {copy.deploymentTransaction}：{standardDeployment.data}
            </p>
          )}
          {standardReceipt.data?.contractAddress && (
            <p className="success">
              {copy.factoryDeployed}：{standardReceipt.data.contractAddress}
            </p>
          )}
          {tokenDeployerAddress && (
            <p className="notice">
              {copy.advancedDeployer}：{tokenDeployerAddress}
            </p>
          )}
          {rewardsFactoryAddress && (
            <p className="notice">
              {copy.rewards} Factory：
              {rewardsFactoryAddress}
            </p>
          )}
          {managerReceipt.isSuccess && rewardsFactoryAddress && (
            <p className="success">
              {interpolate(copy.configured, {
                variable: "NEXT_PUBLIC_BNBX_REWARDS_FACTORY_ADDRESS",
                address: rewardsFactoryAddress,
              })}
            </p>
          )}
          {currentError && (
            <p className="error">
              {deploymentErrorMessage(currentError, isMainnet, copy)}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
