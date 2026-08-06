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
  AUTHORIZED_LP_REWARDS_DEPLOYER,
  LP_REWARDS_DEFAULT_USDT,
  LP_REWARDS_DEPLOYMENT_GAS_LIMIT,
  LP_REWARDS_FEE_RECIPIENT,
  LP_REWARDS_MAINNET_ROUTER,
  buildLPRewardsMainnetDeployment,
} from "@/lib/lp-rewards-mainnet-deployment";
import {
  lpRewardsFactoryAbi,
  lpRewardsFactoryBytecode,
} from "@/lib/lp-rewards-factory-deployment";

const lpRewardsMainnetDeployment = buildLPRewardsMainnetDeployment(
  lpRewardsFactoryAbi,
  lpRewardsFactoryBytecode,
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

export default function DeployLPRewardsMainnetPage() {
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
    address?.toLowerCase() !== AUTHORIZED_LP_REWARDS_DEPLOYER.toLowerCase();

  function deployLPRewardsV2() {
    if (!address || wrongSigner || wrongChain) return;
    deployment.deployContract({
      ...lpRewardsMainnetDeployment,
      chainId: bsc.id,
      account: address,
      gas: LP_REWARDS_DEPLOYMENT_GAS_LIMIT,
    });
  }

  return (
    <main>
      <header className="topbar">
        <Link className="brand" href="/">BNBX</Link>
        <WalletButton />
      </header>
      <section className="form-shell">
        <p className="eyebrow">MAINNET / INDEPENDENT LP REWARDS V2</p>
        <h1 className="form-title">LP Rewards V2 Factory</h1>
        <p className="lead">
          Deploy the reviewed independent LP staking rewards template.
        </p>
        <div className="launch-form">
          <p className="notice">
            Fee Recipient：{LP_REWARDS_FEE_RECIPIENT}<br />
            Pancake V2 Router：{LP_REWARDS_MAINNET_ROUTER}<br />
            Default Rewards (USDT)：{LP_REWARDS_DEFAULT_USDT}<br />
            Minimum qualified LP value：0.01 WBNB
          </p>
          {!isConnected ? (
            <p className="notice">{copy.connectMainnetWallet}</p>
          ) : wrongSigner ? (
            <p className="error">{copy.authorizedWalletOnly}</p>
          ) : wrongChain ? (
            <button className="button wide" type="button" onClick={() => switchChain({ chainId: bsc.id })}>
              {copy.switchMainnet}
            </button>
          ) : (
            <button
              className="button wide"
              type="button"
              disabled={deployment.isPending || receipt.isLoading}
              onClick={deployLPRewardsV2}
            >
              {deployment.isPending
                ? copy.confirmDeploy
                : receipt.isLoading
                  ? copy.waitMainnet
                  : "Deploy Independent LP Rewards V2 Factory"}
            </button>
          )}
          {deployment.data && <p className="notice">{copy.deploymentTransaction}：{deployment.data}</p>}
          {receipt.data?.contractAddress && <p className="success">{copy.factoryDeployed}：{receipt.data.contractAddress}</p>}
          {deployment.error && <p className="error">{deploymentErrorMessage(deployment.error, copy)}</p>}
        </div>
      </section>
    </main>
  );
}
