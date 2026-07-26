"use client";

import { useAccount, useChainId, useDeployContract, useSwitchChain } from "wagmi";
import { useWaitForTransactionReceipt } from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { WalletButton } from "@/components/wallet-button";
import {
  factoryDeploymentAbi,
  factoryDeploymentBytecode,
} from "@/lib/factory-deployment";

const FEE_RECIPIENT = "0xdaf4f62914f7f64c9eabfd473f4db4b7e74048a6";
const PANCAKE_V2_TESTNET_ROUTER =
  "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";

export default function DeployTestnetPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { data: hash, error, isPending, deployContract } = useDeployContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const wrongChain = isConnected && chainId !== bscTestnet.id;

  function deploy() {
    if (!address) return;
    deployContract({
      abi: factoryDeploymentAbi,
      bytecode: factoryDeploymentBytecode,
      args: [FEE_RECIPIENT, PANCAKE_V2_TESTNET_ROUTER],
      chainId: bscTestnet.id,
      account: address,
    });
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/">
          BNBX
        </a>
        <WalletButton />
      </header>
      <section className="form-shell">
        <p className="eyebrow">TESTNET / FACTORY DEPLOYMENT</p>
        <h1 className="form-title">部署 BNBX 测试网 Factory</h1>
        <p className="lead">
          仅部署到 BSC Testnet。部署费接收地址和 Pancake V2 测试网 Router
          已固定，MetaMask 会在发送前显示 Gas 费用。
        </p>
        <div className="launch-form">
          <p className="notice">
            Fee Recipient：{FEE_RECIPIENT}
            <br />
            Pancake Router：{PANCAKE_V2_TESTNET_ROUTER}
          </p>
          {!isConnected ? (
            <p className="notice">请先连接持有 tBNB 的部署钱包。</p>
          ) : wrongChain ? (
            <button
              className="button wide"
              type="button"
              onClick={() => switchChain({ chainId: bscTestnet.id })}
            >
              切换到 BNB 测试网
            </button>
          ) : (
            <button
              className="button wide"
              type="button"
              disabled={isPending || receipt.isLoading}
              onClick={deploy}
            >
              {isPending
                ? "请在 MetaMask 确认部署…"
                : receipt.isLoading
                  ? "等待测试网确认…"
                  : "部署测试网 Factory"}
            </button>
          )}
          {hash && <p className="notice">部署交易：{hash}</p>}
          {receipt.data?.contractAddress && (
            <p className="success">
              Factory 部署成功：{receipt.data.contractAddress}
            </p>
          )}
          {error && <p className="error">{error.message}</p>}
        </div>
      </section>
    </main>
  );
}
