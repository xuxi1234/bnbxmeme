import { lpRewardsFactoryAbi } from "./lp-rewards-factory-deployment";
import { lpRewardsTokenAbi } from "./lp-rewards-token-creation-bytecode";
import { lpRewardsFactoryAddress } from "./deployments";

export const lpRewardsVaultAbi = [
  {
    type: "function",
    name: "claimable",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "amount", type: "uint256" }],
  },
  {
    type: "function",
    name: "stakedLP",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "amount", type: "uint256" }],
  },
  {
    type: "function",
    name: "pair",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "asset", type: "address" }],
  },
  {
    type: "function",
    name: "wbnbValueOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "amount", type: "uint256" }],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ name: "recipient", type: "address" }],
    outputs: [{ name: "amount", type: "uint256" }],
  },
  {
    type: "function",
    name: "stakeLP",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawLP",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [],
  },
] as const;

export {
  lpRewardsFactoryAbi,
  lpRewardsFactoryAddress,
  lpRewardsTokenAbi,
};
