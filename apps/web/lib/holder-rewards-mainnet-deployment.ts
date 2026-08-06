import type { Abi, Hex } from "viem";

export const AUTHORIZED_HOLDER_REWARDS_DEPLOYER =
  "0xbE37AB912De351B9312FA593C9f99e3279FDB0a2" as const;
export const HOLDER_REWARDS_FEE_RECIPIENT =
  "0xdaf4f62914f7f64c9eabfd473f4db4b7e74048a6" as const;
export const HOLDER_REWARDS_MAINNET_ROUTER =
  "0x10ED43C718714eb63d5aA57B78B54704E256024E" as const;
export const HOLDER_REWARDS_DEFAULT_USDT =
  "0x55d398326f99059ff775485246999027b3197955" as const;
export const HOLDER_REWARDS_DEPLOYMENT_GAS_LIMIT = 10_000_000n;

export function buildHolderRewardsMainnetDeployment<
  TAbi extends Abi,
  TBytecode extends Hex,
>(abi: TAbi, bytecode: TBytecode) {
  return {
    abi,
    bytecode,
    args: [
      HOLDER_REWARDS_FEE_RECIPIENT,
      HOLDER_REWARDS_MAINNET_ROUTER,
      HOLDER_REWARDS_DEFAULT_USDT,
    ],
  } as const;
}
