export const BSC_TESTNET_CHAIN_ID = 97 as const;
export const BSC_MAINNET_CHAIN_ID = 56 as const;

export const FEE_RECIPIENT =
  "0xdaf4f62914f7f64c9eabfd473f4db4b7e74048a6" as const;

export const LP_BURN_ADDRESS =
  "0x000000000000000000000000000000000000dEaD" as const;

export type DeploymentAddresses = Readonly<{
  factory: `0x${string}`;
  pancakeV2Factory: `0x${string}`;
  pancakeV2Router: `0x${string}`;
  wbnb: `0x${string}`;
}>;

// Populated only after address verification against official PancakeSwap
// deployment records and a successful Testnet acceptance run.
export const deployments: Partial<
  Record<97 | 56, DeploymentAddresses>
> = {
  97: {
    factory: "0x0000000000000000000000000000000000000000",
    pancakeV2Factory: "0x6725F303b657a9451d8BA641348b6761A6CC7a17",
    pancakeV2Router: "0xD99D1c33F9fC3444f8101754aBC46c52416550D1",
    wbnb: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
  },
};
