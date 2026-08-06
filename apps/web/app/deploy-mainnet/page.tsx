"use client";

import Link from "next/link";
import {
  useAccount,
  useChainId,
  useDeployContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
} from "wagmi";
import { bsc } from "wagmi/chains";
import { WalletButton } from "@/components/wallet-button";
import { useLanguage } from "@/components/language-provider";
import { deploymentCopy, interpolate } from "@/lib/localization-copy";
import {
  AUTHORIZED_HOLDER_REWARDS_DEPLOYER,
  HOLDER_REWARDS_DEFAULT_USDT,
  HOLDER_REWARDS_DEPLOYMENT_GAS_LIMIT,
  HOLDER_REWARDS_FEE_RECIPIENT,
  HOLDER_REWARDS_MAINNET_ROUTER,
  buildHolderRewardsMainnetDeployment,
} from "@/lib/holder-rewards-mainnet-deployment";
import {
  holderRewardsFactoryAbi,
  holderRewardsFactoryBytecode,
} from "@/lib/holder-rewards-factory-deployment";

const holderRewardsMainnetDeployment = buildHolderRewardsMainnetDeployment(
  holderRewardsFactoryAbi,
  holderRewardsFactoryBytecode,
);

function deploymentErrorMessage(
  error: Error,
  copy: (typeof deploymentCopy)["en"],
) {
  const message = error.message.toLowerCase();
  if (message.includes("user rejected") || message.includes("user denied")) {
    return copy.errorCancelled;
  }
  if (message.includes("insufficient funds")) return copy.errorMainnetFunds;
  if (message.includes("max code size exceeded")) return copy.errorCodeSize;
  return interpolate(copy.errorFailed, { message: error.message });
}

export default function DeployHolderRewardsMainnetPage() {
  const { language } = useLanguage();
  const copy = deploymentCopy[language];
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const deployment = useDeployContract();
  const receipt = useWaitForTransactionReceipt({ hash: deployment.data });
  const wrongChain = isConnected && chainId !== bsc.id;
  const wrongSigner =
    isConnected &&
    address?.toLowerCase() !==
      AUTHORIZED_HOLDER_REWARDS_DEPLOYER.toLowerCase();

  function deployHolderRewardsV2() {
    if (!address || wrongSigner || wrongChain) return;
    deployment.deployContract({
      ...holderRewardsMainnetDeployment,
      chainId: bsc.id,
      account: address,
      gas: HOLDER_REWARDS_DEPLOYMENT_GAS_LIMIT,
    });
  }

  return (
    <main>
      <header className="topbar">
        <Link className="brand" href="/">
          BNBX
        </Link>
        <WalletButton />
      </header>
      <section className="form-shell">
        <p className="eyebrow">MAINNET / HOLDER REWARDS V2</p>
        <h1 className="form-title">{copy.titleMainnet}</h1>
        <p className="lead">{copy.leadMainnet}</p>
        <div className="launch-form">
          <p className="notice">
            Fee Recipient：{HOLDER_REWARDS_FEE_RECIPIENT}
            <br />
            Pancake V2 Router：{HOLDER_REWARDS_MAINNET_ROUTER}
            <br />
            Default Rewards (USDT)：{HOLDER_REWARDS_DEFAULT_USDT}
            <br />
            Token Deployer：Factory constructor creates and locks it
          </p>

          {!isConnected ? (
            <p className="notice">{copy.connectMainnetWallet}</p>
          ) : wrongSigner ? (
            <p className="error">{copy.authorizedWalletOnly}</p>
          ) : wrongChain ? (
            <button
              className="button wide"
              type="button"
              onClick={() => switchChain({ chainId: bsc.id })}
            >
              {copy.switchMainnet}
            </button>
          ) : (
            <button
              className="button wide"
              type="button"
              disabled={deployment.isPending || receipt.isLoading}
              onClick={deployHolderRewardsV2}
            >
              {deployment.isPending
                ? copy.confirmDeploy
                : receipt.isLoading
                  ? copy.waitMainnet
                  : `${copy.rewards} Holder V2 Factory`}
            </button>
          )}

          {deployment.data && (
            <p className="notice">
              {copy.deploymentTransaction}：{deployment.data}
            </p>
          )}
          {receipt.data?.contractAddress && (
            <p className="success">
              {copy.factoryDeployed}：{receipt.data.contractAddress}
            </p>
          )}
          {deployment.error && (
            <p className="error">
              {deploymentErrorMessage(deployment.error, copy)}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
