"use client";

import { useState } from "react";
import {
  useAccount,
  useChainId,
  useDeployContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { WalletButton } from "@/components/wallet-button";
import {
  factoryDeploymentAbi,
  factoryDeploymentBytecode,
} from "@/lib/factory-deployment";
import {
  autoLiquidityFactoryDeploymentAbi,
  autoLiquidityFactoryDeploymentBytecode,
} from "@/lib/auto-liquidity-factory-deployment";
import {
  advancedTokenDeployerDeploymentAbi,
  advancedTokenDeployerDeploymentBytecode,
  rewardsFactoryDeploymentAbi,
  rewardsFactoryDeploymentBytecode,
} from "@/lib/rewards-factory-deployment";

const FEE_RECIPIENT = "0xdaf4f62914f7f64c9eabfd473f4db4b7e74048a6";
const PANCAKE_V2_TESTNET_ROUTER =
  "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
const DEPLOYMENT_GAS_LIMIT = 8_000_000n;

function deploymentErrorMessage(error: Error) {
  const message = error.message.toLowerCase();
  if (message.includes("user rejected") || message.includes("user denied")) {
    return "你已在 MetaMask 取消部署。";
  }
  if (message.includes("insufficient funds")) {
    return "测试钱包的 tBNB 不足以支付部署 Gas。";
  }
  if (message.includes("max code size exceeded")) {
    return "Factory 代码超过 BSC 合约大小限制，请使用最新部署页面后重试。";
  }
  return "部署交易未成功发送。请确认 MetaMask 位于 BSC Testnet，刷新页面后重试。";
}

export default function DeployTestnetPage() {
  const [factoryType, setFactoryType] = useState<
    "standard" | "liquidity" | "rewards"
  >("rewards");
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const legacyDeployment = useDeployContract();
  const tokenDeployerDeployment = useDeployContract();
  const rewardsFactoryDeployment = useDeployContract();
  const managerConfiguration = useWriteContract();
  const legacyReceipt = useWaitForTransactionReceipt({
    hash: legacyDeployment.data,
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
  const tokenDeployerAddress = tokenDeployerReceipt.data?.contractAddress;
  const rewardsFactoryAddress = rewardsFactoryReceipt.data?.contractAddress;
  const wrongChain = isConnected && chainId !== bscTestnet.id;

  function deployLegacyFactory() {
    if (!address) return;
    if (factoryType === "liquidity") {
      legacyDeployment.deployContract({
        abi: autoLiquidityFactoryDeploymentAbi,
        bytecode: autoLiquidityFactoryDeploymentBytecode,
        args: [FEE_RECIPIENT, PANCAKE_V2_TESTNET_ROUTER],
        chainId: bscTestnet.id,
        account: address,
        gas: DEPLOYMENT_GAS_LIMIT,
      });
      return;
    }
    legacyDeployment.deployContract({
      abi: factoryDeploymentAbi,
      bytecode: factoryDeploymentBytecode,
      args: [FEE_RECIPIENT, PANCAKE_V2_TESTNET_ROUTER],
      chainId: bscTestnet.id,
      account: address,
      gas: DEPLOYMENT_GAS_LIMIT,
    });
  }

  function deployAdvancedTokenDeployer() {
    if (!address) return;
    tokenDeployerDeployment.deployContract({
      abi: advancedTokenDeployerDeploymentAbi,
      bytecode: advancedTokenDeployerDeploymentBytecode,
      args: [address],
      chainId: bscTestnet.id,
      account: address,
      gas: DEPLOYMENT_GAS_LIMIT,
    });
  }

  function deployRewardsFactory() {
    if (!address || !tokenDeployerAddress) return;
    rewardsFactoryDeployment.deployContract({
      abi: rewardsFactoryDeploymentAbi,
      bytecode: rewardsFactoryDeploymentBytecode,
      args: [
        FEE_RECIPIENT,
        PANCAKE_V2_TESTNET_ROUTER,
        tokenDeployerAddress,
      ],
      chainId: bscTestnet.id,
      account: address,
      gas: DEPLOYMENT_GAS_LIMIT,
    });
  }

  function configureRewardsFactory() {
    if (!address || !tokenDeployerAddress || !rewardsFactoryAddress) return;
    managerConfiguration.writeContract({
      abi: advancedTokenDeployerDeploymentAbi,
      address: tokenDeployerAddress,
      functionName: "configureManager",
      args: [rewardsFactoryAddress],
      chainId: bscTestnet.id,
      account: address,
    });
  }

  const currentError =
    legacyDeployment.error ??
    tokenDeployerDeployment.error ??
    rewardsFactoryDeployment.error ??
    managerConfiguration.error;

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
          <label>
            Factory 类型
            <select
              value={factoryType}
              onChange={(event) =>
                setFactoryType(
                  event.target.value as
                    | "standard"
                    | "liquidity"
                    | "rewards",
                )
              }
            >
              <option value="rewards">持币分红 / 添加 LP 分红 Factory</option>
              <option value="liquidity">自动回流 V2 Factory</option>
              <option value="standard">标准 0 税 Factory</option>
            </select>
          </label>
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
          ) : factoryType === "rewards" ? (
            <div className="stack">
              <p className="notice">
                高级模板需依次完成三笔链上操作。每一步确认后才会开放下一步。
              </p>
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
                  ? "步骤 1 已完成"
                  : tokenDeployerDeployment.isPending
                    ? "请确认步骤 1…"
                    : tokenDeployerReceipt.isLoading
                      ? "等待步骤 1 上链…"
                      : "步骤 1：部署高级代币部署器"}
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
                  ? "步骤 2 已完成"
                  : rewardsFactoryDeployment.isPending
                    ? "请确认步骤 2…"
                    : rewardsFactoryReceipt.isLoading
                      ? "等待步骤 2 上链…"
                      : "步骤 2：部署分红 Factory"}
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
                  ? "步骤 3 已完成，Factory 可用"
                  : managerConfiguration.isPending
                    ? "请确认步骤 3…"
                    : managerReceipt.isLoading
                      ? "等待步骤 3 上链…"
                      : "步骤 3：授权 Factory 创建代币"}
              </button>
            </div>
          ) : (
            <button
              className="button wide"
              type="button"
              disabled={
                legacyDeployment.isPending || legacyReceipt.isLoading
              }
              onClick={deployLegacyFactory}
            >
              {legacyDeployment.isPending
                ? "请在 MetaMask 确认部署…"
                : legacyReceipt.isLoading
                  ? "等待测试网确认…"
                  : factoryType === "liquidity"
                    ? "部署自动回流 V2 Factory"
                    : "部署标准 0 税 Factory"}
            </button>
          )}
          {legacyDeployment.data && (
            <p className="notice">部署交易：{legacyDeployment.data}</p>
          )}
          {legacyReceipt.data?.contractAddress && (
            <p className="success">
              Factory 部署成功：{legacyReceipt.data.contractAddress}
            </p>
          )}
          {tokenDeployerAddress && (
            <p className="notice">高级代币部署器：{tokenDeployerAddress}</p>
          )}
          {rewardsFactoryAddress && (
            <p className="notice">分红 Factory：{rewardsFactoryAddress}</p>
          )}
          {managerReceipt.isSuccess && rewardsFactoryAddress && (
            <p className="success">
              配置成功。请将 NEXT_PUBLIC_BNBX_REWARDS_FACTORY_ADDRESS
              设为：{rewardsFactoryAddress}
            </p>
          )}
          {currentError && (
            <p className="error">{deploymentErrorMessage(currentError)}</p>
          )}
        </div>
      </section>
    </main>
  );
}
