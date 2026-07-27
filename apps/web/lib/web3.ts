import { QueryClient } from "@tanstack/react-query";
import { createConfig, fallback, http } from "wagmi";
import { createPublicClient } from "viem";
import { bscTestnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export const testnetFactoryAddress =
  (process.env.NEXT_PUBLIC_BNBX_FACTORY_ADDRESS as
    | `0x${string}`
    | undefined) ?? "0x576b09d5672d0ca4d0fb4d65895157ee4c32c4b4";

export const autoLiquidityFactoryAddress =
  (process.env.NEXT_PUBLIC_BNBX_AUTO_LIQUIDITY_FACTORY_ADDRESS as
    | `0x${string}`
    | undefined) ?? "0xdf29818f29d319bb6d85e3931868646c98c303a5";
export const rewardsFactoryAddress =
  process.env.NEXT_PUBLIC_BNBX_REWARDS_FACTORY_ADDRESS as
    | `0x${string}`
    | undefined;
export const testnetPancakeRouterAddress =
  "0xD99D1c33F9fC3444f8101754aBC46c52416550D1" as const;

export const queryClient = new QueryClient();
const testnetTransport = fallback([
  http("https://bsc-testnet-rpc.publicnode.com", { timeout: 12_000 }),
  http("https://bsc-testnet.drpc.org", { timeout: 12_000 }),
  http("https://data-seed-prebsc-1-s1.bnbchain.org:8545", {
    timeout: 12_000,
  }),
]);
export const testnetPublicClient = createPublicClient({
  chain: bscTestnet,
  transport: testnetTransport,
});

export const wagmiConfig = createConfig({
  chains: [bscTestnet],
  connectors: [injected()],
  transports: {
    [bscTestnet.id]: testnetTransport,
  },
  ssr: true,
});

export const factoryAbi = [
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

const taxSideComponents = [
  { name: "burn", type: "uint16" },
  { name: "liquidity", type: "uint16" },
  { name: "marketing", type: "uint16" },
  { name: "rewards", type: "uint16" },
] as const;

const taxesComponents = [
  { name: "buy", type: "tuple", components: taxSideComponents },
  { name: "sell", type: "tuple", components: taxSideComponents },
] as const;

const autoLiquidityCreateComponents = [
  { name: "name", type: "string" },
  { name: "symbol", type: "string" },
  { name: "graduationTargetBNB", type: "uint8" },
  { name: "metadataURI", type: "string" },
  { name: "vanitySalt", type: "bytes32" },
  { name: "marketingWallet", type: "address" },
  { name: "taxes", type: "tuple", components: taxesComponents },
] as const;

const rewardsCreateComponents = [
  ...autoLiquidityCreateComponents,
  { name: "template", type: "uint8" },
  { name: "minimumRewardShare", type: "uint256" },
] as const;

export const rewardsFactoryAbi = [
  {
    type: "function",
    name: "findVanitySalt",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "marketingWallet", type: "address" },
      { name: "taxes", type: "tuple", components: taxesComponents },
      { name: "template", type: "uint8" },
      { name: "minimumRewardShare", type: "uint256" },
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
    name: "createVanityToken",
    stateMutability: "payable",
    inputs: [
      {
        name: "request",
        type: "tuple",
        components: rewardsCreateComponents,
      },
    ],
    outputs: [
      { name: "tokenAddress", type: "address" },
      { name: "curveAddress", type: "address" },
    ],
  },
  {
    type: "function",
    name: "createVanityTokenAndBuy",
    stateMutability: "payable",
    inputs: [
      {
        name: "request",
        type: "tuple",
        components: rewardsCreateComponents,
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

export const autoLiquidityFactoryAbi = [
  {
    type: "function",
    name: "findVanitySalt",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "marketingWallet", type: "address" },
      { name: "taxes", type: "tuple", components: taxesComponents },
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
    name: "createVanityToken",
    stateMutability: "payable",
    inputs: [
      {
        name: "request",
        type: "tuple",
        components: autoLiquidityCreateComponents,
      },
    ],
    outputs: [
      { name: "tokenAddress", type: "address" },
      { name: "curveAddress", type: "address" },
    ],
  },
  {
    type: "function",
    name: "createVanityTokenAndBuy",
    stateMutability: "payable",
    inputs: [
      {
        name: "request",
        type: "tuple",
        components: autoLiquidityCreateComponents,
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

export const curveAbi = [
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
