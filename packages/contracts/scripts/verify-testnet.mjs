import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, defineChain, http, parseEther } from "viem";

const rpcUrl = process.env.BSC_TESTNET_RPC_URL;
if (!rpcUrl) throw new Error("BSC_TESTNET_RPC_URL is required");

const root = resolve(import.meta.dirname, "..");
const deployment = JSON.parse(
  readFileSync(resolve(root, "deployments/bsc-testnet.json"), "utf8"),
);
if (deployment.chainId !== 97) {
  throw new Error(`Deployment chain ID is ${deployment.chainId}, expected 97`);
}

const chain = defineChain({
  id: 97,
  name: "BNB Smart Chain Testnet",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});
const client = createPublicClient({ chain, transport: http(rpcUrl) });

const factoryAbi = [
  {
    type: "function",
    name: "CREATION_FEE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "feeRecipient",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "pancakeV2Router",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
];
const routerAbi = [
  {
    type: "function",
    name: "factory",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "WETH",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
];

const actualChainId = await client.getChainId();
if (actualChainId !== 97) {
  throw new Error(`RPC chain ID is ${actualChainId}, expected 97`);
}
const code = await client.getCode({ address: deployment.factory });
if (!code || code === "0x") throw new Error("Factory has no deployed bytecode");

const [creationFee, feeRecipient, router, routerFactory, routerWbnb] =
  await Promise.all([
    client.readContract({
      address: deployment.factory,
      abi: factoryAbi,
      functionName: "CREATION_FEE",
    }),
    client.readContract({
      address: deployment.factory,
      abi: factoryAbi,
      functionName: "feeRecipient",
    }),
    client.readContract({
      address: deployment.factory,
      abi: factoryAbi,
      functionName: "pancakeV2Router",
    }),
    client.readContract({
      address: deployment.pancakeV2Router,
      abi: routerAbi,
      functionName: "factory",
    }),
    client.readContract({
      address: deployment.pancakeV2Router,
      abi: routerAbi,
      functionName: "WETH",
    }),
  ]);

function sameAddress(actual, expected, label) {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`${label} mismatch: ${actual} != ${expected}`);
  }
}

if (creationFee !== parseEther("0.001")) {
  throw new Error(`Creation fee mismatch: ${creationFee}`);
}
sameAddress(feeRecipient, deployment.feeRecipient, "Fee recipient");
sameAddress(router, deployment.pancakeV2Router, "Router");
sameAddress(routerFactory, deployment.pancakeV2Factory, "Pancake factory");
sameAddress(routerWbnb, deployment.wbnb, "WBNB");

console.log(
  JSON.stringify(
    {
      status: "verified",
      chainId: actualChainId,
      factory: deployment.factory,
      deploymentBlock: deployment.deploymentBlock,
      creationFee: creationFee.toString(),
      feeRecipient,
      router,
      pancakeFactory: routerFactory,
      wbnb: routerWbnb,
    },
    null,
    2,
  ),
);
