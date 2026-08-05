import { QueryClient } from "@tanstack/react-query";
import { createConfig, fallback, http } from "wagmi";
import { createPublicClient } from "viem";
import { bsc, bscTestnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { advancedFactoryAbi } from "./advanced-factory-abi";
import {
  autoLiquidityFactoryAddress,
  blockExplorerUrl,
  holderRewardsFactoryAddress,
  legacyRewardsFactoryAddress,
  legacyStandardFactoryAddress,
  lpBurnAddress,
  pancakeFactoryAddress,
  pancakeRouterAddress,
  rewardsFactoryAddress,
  standardFactoryAddress,
  v3StandardFactoryAddress,
} from "./deployments";

export {
  autoLiquidityFactoryAddress,
  blockExplorerUrl,
  holderRewardsFactoryAddress,
  legacyRewardsFactoryAddress,
  legacyStandardFactoryAddress,
  lpBurnAddress,
  pancakeFactoryAddress,
  pancakeRouterAddress,
  rewardsFactoryAddress,
  standardFactoryAddress,
  v3StandardFactoryAddress,
};
export const testnetFactoryAddress = standardFactoryAddress;
export const testnetPancakeRouterAddress = pancakeRouterAddress;

export const queryClient = new QueryClient();
const testnetTransport = fallback([
  http("https://bsc-testnet-rpc.publicnode.com", { timeout: 12_000 }),
  http("https://bsc-testnet.drpc.org", { timeout: 12_000 }),
  http("https://data-seed-prebsc-1-s1.bnbchain.org:8545", {
    timeout: 12_000,
  }),
]);
const mainnetTransport = fallback([
  http("https://bsc-rpc.publicnode.com", { timeout: 12_000 }),
  http("https://bsc.drpc.org", { timeout: 12_000 }),
  http("https://bsc-dataseed.binance.org", { timeout: 12_000 }),
]);
export const testnetPublicClient = createPublicClient({
  chain: bsc,
  transport: mainnetTransport,
});

export const wagmiConfig = createConfig({
  chains: [bscTestnet, bsc],
  connectors: [injected()],
  transports: {
    [bscTestnet.id]: testnetTransport,
    [bsc.id]: mainnetTransport,
  },
  ssr: true,
});

const standardTokenCreatedEvent = {
  type: "event",
  name: "TokenCreated",
  anonymous: false,
  inputs: [
    { name: "token", type: "address", indexed: true },
    { name: "curve", type: "address", indexed: true },
    { name: "creator", type: "address", indexed: true },
    { name: "name", type: "string", indexed: false },
    { name: "symbol", type: "string", indexed: false },
    { name: "graduationTargetBNB", type: "uint8", indexed: false },
    { name: "metadataURI", type: "string", indexed: false },
  ],
} as const;

export const factoryAbi = [
  standardTokenCreatedEvent,
  {
    type: "function",
    name: "tokenCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allTokens",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [{ name: "token", type: "address" }],
  },
  {
    type: "function",
    name: "tokenMetadataURI",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "metadataURI", type: "string" }],
  },
  {
    type: "function",
    name: "createVanityToken",
    stateMutability: "payable",
    inputs: [
      {
        name: "request",
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "graduationTargetBNB", type: "uint8" },
          { name: "metadataURI", type: "string" },
          { name: "vanitySalt", type: "bytes32" },
        ],
      },
    ],
    outputs: [
      { name: "tokenAddress", type: "address" },
      { name: "curveAddress", type: "address" },
    ],
  },
  {
    type: "function",
    name: "findVanitySalt",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "start", type: "uint256" },
      { name: "maxIterations", type: "uint256" },
    ],
    outputs: [
      { name: "found", type: "bool" },
      { name: "salt", type: "bytes32" },
      { name: "predicted", type: "address" },
    ],
  },
  {
    type: "function",
    name: "curveOf",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "curve", type: "address" }],
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "payable",
    inputs: [
      { name: "token", type: "address" },
      { name: "minTokensOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "refundRecipient", type: "address" },
    ],
    outputs: [{ name: "tokensOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "sell",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "tokensIn", type: "uint256" },
      { name: "minBNBOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "netBNB", type: "uint256" }],
  },
  {
    type: "function",
    name: "createVanityTokenAndBuy",
    stateMutability: "payable",
    inputs: [
      {
        name: "request",
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "graduationTargetBNB", type: "uint8" },
          { name: "metadataURI", type: "string" },
          { name: "vanitySalt", type: "bytes32" },
        ],
      },
      {
        name: "buyRequest",
        type: "tuple",
        components: [
          { name: "minTokensOut", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "refundRecipient", type: "address" },
        ],
      },
    ],
    outputs: [
      { name: "tokenAddress", type: "address" },
      { name: "curveAddress", type: "address" },
      { name: "tokensOut", type: "uint256" },
    ],
  },
] as const;

export const rewardsFactoryAbi = advancedFactoryAbi;
export const autoLiquidityFactoryAbi = advancedFactoryAbi;

export const curveAbi = [
  {
    type: "function",
    name: "TRADE_FEE_BPS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "creator",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "liquidityPair",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "quoteBuy",
    stateMutability: "view",
    inputs: [{ name: "grossBNB", type: "uint256" }],
    outputs: [
      { name: "acceptedGross", type: "uint256" },
      { name: "feeBNB", type: "uint256" },
      { name: "netBNB", type: "uint256" },
      { name: "tokensOut", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "quoteSell",
    stateMutability: "view",
    inputs: [{ name: "tokensIn", type: "uint256" }],
    outputs: [
      { name: "grossBNB", type: "uint256" },
      { name: "feeBNB", type: "uint256" },
      { name: "netBNB", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "realBNBPrincipal",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "graduationTarget",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "state",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

export const tokenAbi = [
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "launchManager",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "graduationAuthority",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "liquidityPairUnlocked",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "buyTaxes",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "burn", type: "uint16" },
      { name: "liquidity", type: "uint16" },
      { name: "marketing", type: "uint16" },
      { name: "rewards", type: "uint16" },
    ],
  },
  {
    type: "function",
    name: "sellTaxes",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "burn", type: "uint16" },
      { name: "liquidity", type: "uint16" },
      { name: "marketing", type: "uint16" },
      { name: "rewards", type: "uint16" },
    ],
  },
  {
    type: "function",
    name: "buyRewardTaxBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint16" }],
  },
  {
    type: "function",
    name: "sellRewardTaxBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint16" }],
  },
  {
    type: "function",
    name: "minimumRewardBalance",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "marketingWallet",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "template",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "rewardVault",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "rewardToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "minimumRewardShare",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const rewardVaultAbi = [
  {
    type: "function",
    name: "claimable",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "amount", type: "uint256" }],
  },
  {
    type: "function",
    name: "shares",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "amount", type: "uint256" }],
  },
  {
    type: "function",
    name: "shareAsset",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "asset", type: "address" }],
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
