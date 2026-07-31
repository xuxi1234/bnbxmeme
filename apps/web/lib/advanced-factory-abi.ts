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

const advancedCreateComponents = [
  { name: "name", type: "string" },
  { name: "symbol", type: "string" },
  { name: "graduationTargetBNB", type: "uint8" },
  { name: "metadataURI", type: "string" },
  { name: "vanitySalt", type: "bytes32" },
  { name: "marketingWallet", type: "address" },
  { name: "rewardToken", type: "address" },
  { name: "taxes", type: "tuple", components: taxesComponents },
  { name: "template", type: "uint8" },
  { name: "minimumRewardShare", type: "uint256" },
] as const;

const buyRequestComponents = [
  { name: "minTokensOut", type: "uint256" },
  { name: "deadline", type: "uint256" },
  { name: "refundRecipient", type: "address" },
] as const;

export const advancedFactoryAbi = [
  {
    type: "event",
    name: "TokenCreated",
    anonymous: false,
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "curve", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      {
        name: "graduationTargetBNB",
        type: "uint8",
        indexed: false,
      },
      { name: "template", type: "uint8", indexed: false },
      { name: "rewardToken", type: "address", indexed: false },
    ],
  },
  {
    type: "function",
    name: "findVanitySalt",
    stateMutability: "view",
    inputs: [
      {
        name: "request",
        type: "tuple",
        components: advancedCreateComponents,
      },
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
        components: advancedCreateComponents,
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
        components: advancedCreateComponents,
      },
      {
        name: "buyRequest",
        type: "tuple",
        components: buyRequestComponents,
      },
    ],
    outputs: [
      { name: "tokenAddress", type: "address" },
      { name: "curveAddress", type: "address" },
      { name: "tokensOut", type: "uint256" },
    ],
  },
] as const;
