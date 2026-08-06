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
import {
  zeroTaxFactoryDeploymentAbi,
  zeroTaxFactoryDeploymentBytecode,
} from "@/lib/zero-tax-factory-deployment";
import {
  AUTHORIZED_ZERO_TAX_DEPLOYER,
  ZERO_TAX_DEPLOYMENT_GAS_LIMIT,
  ZERO_TAX_FEE_RECIPIENT,
  ZERO_TAX_MAINNET_ROUTER,
  buildZeroTaxMainnetDeployment,
} from "@/lib/zero-tax-mainnet-deployment";

const zeroTaxMainnetDeployment = buildZeroTaxMainnetDeployment(
  zeroTaxFactoryDeploymentAbi,
  zeroTaxFactoryDeploymentBytecode,
);

export default function DeployZeroTaxMainnetPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const deployment = useDeployContract();
  const receipt = useWaitForTransactionReceipt({ hash: deployment.data });
  const wrongChain = isConnected && chainId !== bsc.id;
  const wrongSigner =
    isConnected &&
    address?.toLowerCase() !== AUTHORIZED_ZERO_TAX_DEPLOYER.toLowerCase();

  function deployZeroTaxFactory() {
    if (!address || wrongSigner || wrongChain) return;
    deployment.deployContract({
      ...zeroTaxMainnetDeployment,
      chainId: bsc.id,
      account: address,
      gas: ZERO_TAX_DEPLOYMENT_GAS_LIMIT,
    });
  }

  return (
    <main>
      <header className="topbar">
        <Link className="brand" href="/">BNBX</Link>
        <WalletButton />
      </header>
      <section className="form-shell">
        <p className="eyebrow">MAINNET / INDEPENDENT ZERO TAX</p>
        <h1 className="form-title">0% Tax Factory — 1–18 BNB</h1>
        <p className="lead">Deploy the independent production zero-tax Factory.</p>
        <div className="launch-form">
          <p className="notice">
            Fee Recipient：{ZERO_TAX_FEE_RECIPIENT}<br />
            Pancake V2 Router：{ZERO_TAX_MAINNET_ROUTER}<br />
            Graduation targets：integer 1–18 BNB
          </p>
          {!isConnected ? (
            <p className="notice">Connect the authorized deployment wallet.</p>
          ) : wrongSigner ? (
            <p className="error">Only the authorized deployment wallet may continue.</p>
          ) : wrongChain ? (
            <button className="button wide" type="button" onClick={() => switchChain({ chainId: bsc.id })}>
              Switch to BSC Mainnet
            </button>
          ) : (
            <button className="button wide" type="button" disabled={deployment.isPending || receipt.isLoading} onClick={deployZeroTaxFactory}>
              {deployment.isPending ? "Confirm in wallet" : receipt.isLoading ? "Waiting for confirmation…" : "Deploy Independent 0% Tax Factory"}
            </button>
          )}
          {deployment.data && <p className="notice">Transaction：{deployment.data}</p>}
          {receipt.data?.contractAddress && <p className="success">Factory：{receipt.data.contractAddress}</p>}
          {deployment.error && <p className="error">Deployment failed：{deployment.error.message}</p>}
        </div>
      </section>
    </main>
  );
}
