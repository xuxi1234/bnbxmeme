import type { Abi } from "viem";

export const AUTHORIZED_ZERO_TAX_DEPLOYER =
  "0xbE37AB912De351B9312FA593C9f99e3279FDB0a2" as const;
export const ZERO_TAX_FEE_RECIPIENT =
  "0xdaf4f62914f7f64c9eabfd473f4db4b7e74048a6" as const;
export const ZERO_TAX_MAINNET_ROUTER =
  "0x10ED43C718714eb63d5aA57B78B54704E256024E" as const;
export const ZERO_TAX_DEPLOYMENT_GAS_LIMIT = 10_000_000n;

export function buildZeroTaxMainnetDeployment<
  TAbi extends Abi,
  TBytecode extends `0x${string}`,
>(abi: TAbi, bytecode: TBytecode) {
  return {
    abi,
    bytecode,
    args: [ZERO_TAX_FEE_RECIPIENT, ZERO_TAX_MAINNET_ROUTER],
  } as const;
}
