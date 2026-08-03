import { decodeEventLog, isAddress, parseEther, zeroAddress } from "viem";
import type { Log, TransactionReceipt } from "viem";

export const BSC_TESTNET_CHAIN_ID = 97;
export const BSC_TESTNET_EXPLORER = "https://testnet.bscscan.com";

export const TESTNET_STANDARD_FACTORY =
  "0xC59fFc56743539cb502036004cD61404a793e42B" as const;
export const TESTNET_ADVANCED_DEPLOYER =
  "0xD443F346Cc9404592abF8B391C3b2dF519FE504D" as const;
export const TESTNET_REWARDS_FACTORY =
  "0x8f16eAaF401c27EfFF22B6d07D7DB8c767D07Cf7" as const;
export const TESTNET_PANCAKE_ROUTER =
  "0xD99D1c33F9fC3444f8101754aBC46c52416550D1" as const;
export const TESTNET_PANCAKE_FACTORY =
  "0x6725F303b657a9451d8BA641348b6761A6CC7a17" as const;
export const TESTNET_WBNB =
  "0xae13d989dac2f0debff460ac112a837c89baa7cd" as const;
export const TESTNET_BUSD =
  "0x78867BbEeF44f2326bF8DDd1941a4439382EF2A7" as const;
export const TESTNET_BUSD_WBNB_PAIR =
  "0x85EcdCdD01EBE0bFD0aBa74B81CA6D7F4a53582B" as const;

export const TESTNET_CREATION_FEE = parseEther("0.001");
export const TESTNET_GRADUATION_BUY = parseEther("0.011");
export const TESTNET_HOLDER_MINIMUM = parseEther("1000000");
export const TESTNET_LP_MINIMUM = parseEther("0.000001");
export const TESTNET_VANITY_LIMIT = 500_000;
export const TESTNET_VANITY_CHUNK = 10_000;

export type AcceptanceTemplate = "standard" | "holders" | "lp";

export function acceptanceFactory(template: AcceptanceTemplate) {
  return template === "standard"
    ? TESTNET_STANDARD_FACTORY
    : TESTNET_REWARDS_FACTORY;
}

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

const advancedTokenCreatedEvent = {
  type: "event",
  name: "TokenCreated",
  anonymous: false,
  inputs: [
    { name: "token", type: "address", indexed: true },
    { name: "curve", type: "address", indexed: true },
    { name: "creator", type: "address", indexed: true },
    { name: "graduationTargetBNB", type: "uint8", indexed: false },
    { name: "template", type: "uint8", indexed: false },
    { name: "rewardToken", type: "address", indexed: false },
  ],
} as const;

export const acceptanceStandardFactoryAbi = [
  standardTokenCreatedEvent,
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
] as const;

export function buildAcceptanceCreateRequest({
  template,
  name,
  symbol,
  creator,
  vanitySalt,
}: {
  template: AcceptanceTemplate;
  name: string;
  symbol: string;
  creator: `0x${string}`;
  vanitySalt: `0x${string}`;
}) {
  if (!isAddress(creator) || creator === zeroAddress) {
    throw new Error("Invalid creator address");
  }
  if (!name.trim() || !symbol.trim()) {
    throw new Error("Name and symbol are required");
  }
  if (template === "standard") {
    return {
      name: name.trim(),
      symbol: symbol.trim(),
      graduationTargetBNB: 1,
      metadataURI: "",
      vanitySalt,
    } as const;
  }
  return {
    name: name.trim(),
    symbol: symbol.trim(),
    graduationTargetBNB: 1,
    metadataURI: "",
    vanitySalt,
    marketingWallet: creator,
    rewardToken: TESTNET_BUSD,
    taxes: {
      buy: { burn: 0, liquidity: 0, marketing: 0, rewards: 100 },
      sell: { burn: 0, liquidity: 0, marketing: 0, rewards: 100 },
    },
    template: template === "holders" ? 0 : 1,
    minimumRewardShare:
      template === "holders" ? TESTNET_HOLDER_MINIMUM : TESTNET_LP_MINIMUM,
  } as const;
}

export function tokenCreatedFromReceipt(
  receipt: Pick<TransactionReceipt, "logs">,
  template: AcceptanceTemplate,
) {
  const factory = acceptanceFactory(template).toLowerCase();
  const abi = [
    template === "standard"
      ? standardTokenCreatedEvent
      : advancedTokenCreatedEvent,
  ] as const;
  for (const log of receipt.logs as Log[]) {
    if (log.address.toLowerCase() !== factory) continue;
    try {
      const decoded = decodeEventLog({
        abi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== "TokenCreated") continue;
      const args = decoded.args as {
        token?: `0x${string}`;
        curve?: `0x${string}`;
      };
      if (
        args.token &&
        args.curve &&
        isAddress(args.token) &&
        isAddress(args.curve)
      ) {
        return { token: args.token, curve: args.curve };
      }
    } catch {
      // A creation receipt also includes ERC-20, Pair, and curve events.
    }
  }
  return null;
}

export const acceptanceErc20Abi = [
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
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

export const acceptanceRewardVaultAbi = [
  {
    type: "function",
    name: "claimable",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "shares",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "shareAsset",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ name: "recipient", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "claimFor",
    stateMutability: "nonpayable",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "syncRewards",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "processRewards",
    stateMutability: "nonpayable",
    inputs: [{ name: "requestedGas", type: "uint256" }],
    outputs: [
      { name: "iterations", type: "uint256" },
      { name: "claims", type: "uint256" },
      { name: "cursor", type: "uint256" },
    ],
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

export const acceptanceRouterAbi = [
  {
    type: "function",
    name: "addLiquidityETH",
    stateMutability: "payable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amountTokenDesired", type: "uint256" },
      { name: "amountTokenMin", type: "uint256" },
      { name: "amountETHMin", type: "uint256" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [
      { name: "amountToken", type: "uint256" },
      { name: "amountETH", type: "uint256" },
      { name: "liquidity", type: "uint256" },
    ],
  },
] as const;
