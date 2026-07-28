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
const PANCAKE_V2_MAINNET_ROUTER =
  "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const DEPLOYMENT_GAS_LIMIT = 8_000_000n;

function deploymentErrorMessage(error: Error, isMainnet: boolean) {
  const message = error.message.toLowerCase();
  if (message.includes("user rejected") || message.includes("user denied")) {
    return "你已在 MetaMask 取消部署。";
  }
  if (message.includes("insufficient funds")) {
    return isMainnet
      ? "主网钱包的 BNB 不足以支付部署 Gas。"
      : "测试钱包的 tBNB 不足以支付部署 Gas。";
  }
  if (message.includes("max code size exceeded")) {
    return "Factory 代码超过 BSC 合约大小限制，请使用最新部署页面后重试。";
  }
  return `交易未成功发送：${error.message}`;
}

export default function DeployTestnetPage() {
  const pathname = usePathname();
  const isMainnet = pathname.includes("mainnet");
  const activeChain = isMainnet ? bsc : bscTestnet;
  const pancakeRouter = isMainnet
    ? PANCAKE_V2_MAINNET_ROUTER
    : PANCAKE_V2_TESTNET_ROUTER;
  const [factoryType, setFactoryType] = useState<
    "standard" | "liquidity" | "rewards"
  >("rewards");
  const [resumedTokenDeployer, setResumedTokenDeployer] =
    useState<`0x${string}` | null>(null);
  const [resumedRewardsFactory, setResumedRewardsFactory] =
    useState<`0x${string}` | null>(null);
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
  const tokenDeployerAddress =
    tokenDeployerReceipt.data?.contractAddress ?? resumedTokenDeployer;
  const rewardsFactoryAddress =
    rewardsFactoryReceipt.data?.contractAddress ?? resumedRewardsFactory;
  const wrongChain = isConnected && chainId !== activeChain.id;

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

  function deployLegacyFactory() {
    if (!address) return;
    legacyDeployment.deployContract({
      abi: factoryDeploymentAbi,
      bytecode: factoryDeploymentBytecode,
      args: [FEE_RECIPIENT, pancakeRouter],
      chainId: activeChain.id,
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
      chainId: activeChain.id,
      account: address,
      gas: DEPLOYMENT_GAS_LIMIT,
    });
  }

  function deployRewardsFactory() {
    if (!address || !tokenDeployerAddress) return;
    rewardsFactoryDeployment.deployContract({
      abi:
        factoryType === "liquidity"
          ? autoLiquidityFactoryDeploymentAbi
          : rewardsFactoryDeploymentAbi,
      bytecode:
        factoryType === "liquidity"
          ? autoLiquidityFactoryDeploymentBytecode
          : rewardsFactoryDeploymentBytecode,
      args: [
        FEE_RECIPIENT,
        pancakeRouter,
        tokenDeployerAddress,
      ],
      chainId: activeChain.id,
      account: address,
      gas: DEPLOYMENT_GAS_LIMIT,
    });
  }

  function configureRewardsFactory() {
    if (!address || !tokenDeployerAddress || !rewardsFactoryAddress) return;
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
      : legacyDeployment.error ??
        tokenDeployerDeployment.error ??
        rewardsFactoryDeployment.error;

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
            ? "MAINNET CANARY / FACTORY DEPLOYMENT"
            : "TESTNET / FACTORY DEPLOYMENT"}
        </p>
        <h1 className="form-title">
          部署 BNBX {isMainnet ? "主网小额灰度" : "测试网"} Factory
        </h1>
        <p className="lead">
          仅部署到{" "}
          {isMainnet
            ? "BSC Mainnet；毕业档位为 0.01–0.18 BNB"
            : "BSC Testnet"}
          。部署费接收地址和 Pancake V2 Router 已固定，MetaMask
          会在发送前显示 Gas 费用。
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
            Pancake Router：{pancakeRouter}
          </p>
          {!isConnected ? (
            <p className="notice">
              请先连接持有 {isMainnet ? "BNB" : "tBNB"} 的部署钱包。
            </p>
          ) : wrongChain ? (
            <button
              className="button wide"
              type="button"
              onClick={() => switchChain({ chainId: activeChain.id })}
            >
              切换到 BNB {isMainnet ? "主网" : "测试网"}
            </button>
          ) : factoryType !== "standard" ? (
            <div className="stack">
              <p className="notice">
                自动回流及分红模板需依次完成三笔链上操作。每一步确认后才会开放下一步。
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
                      : factoryType === "liquidity"
                        ? "步骤 2：部署自动回流 V2 Factory"
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
                  ? `等待${isMainnet ? "主网" : "测试网"}确认…`
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
            <p className="notice">
              {factoryType === "liquidity" ? "自动回流" : "分红"} Factory：
              {rewardsFactoryAddress}
            </p>
          )}
          {managerReceipt.isSuccess && rewardsFactoryAddress && (
            <p className="success">
              配置成功。请将{" "}
              {factoryType === "liquidity"
                ? "NEXT_PUBLIC_BNBX_AUTO_LIQUIDITY_FACTORY_ADDRESS"
                : "NEXT_PUBLIC_BNBX_REWARDS_FACTORY_ADDRESS"}
              设为：{rewardsFactoryAddress}
            </p>
          )}
          {currentError && (
            <p className="error">
              {deploymentErrorMessage(currentError, isMainnet)}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
