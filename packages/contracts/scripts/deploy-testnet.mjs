import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const CHAIN_ID = 97;
const PANCAKE_V2_ROUTER = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
const PANCAKE_V2_FACTORY = "0x6725F303b657a9451d8BA641348b6761A6CC7a17";
const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const DEFAULT_FEE_RECIPIENT =
  "0xdaf4f62914f7f64c9eabfd473f4db4b7e74048a6";

const rpcUrl = process.env.BSC_TESTNET_RPC_URL;
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const feeRecipient = process.env.FEE_RECIPIENT ?? DEFAULT_FEE_RECIPIENT;

if (!rpcUrl) throw new Error("BSC_TESTNET_RPC_URL is required");
if (!privateKey) throw new Error("DEPLOYER_PRIVATE_KEY is required");
if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  throw new Error("DEPLOYER_PRIVATE_KEY must be a 32-byte 0x-prefixed key");
}

const chain = defineChain({
  id: CHAIN_ID,
  name: "BNB Smart Chain Testnet",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  blockExplorers: {
    default: { name: "BscScan Testnet", url: "https://testnet.bscscan.com" },
  },
});

const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

const actualChainId = await publicClient.getChainId();
if (actualChainId !== CHAIN_ID) {
  throw new Error(`Refusing deployment: RPC chain ID is ${actualChainId}, expected 97`);
}

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

const [routerFactory, routerWbnb] = await Promise.all([
  publicClient.readContract({
    address: PANCAKE_V2_ROUTER,
    abi: routerAbi,
    functionName: "factory",
  }),
  publicClient.readContract({
    address: PANCAKE_V2_ROUTER,
    abi: routerAbi,
    functionName: "WETH",
  }),
]);

if (routerFactory.toLowerCase() !== PANCAKE_V2_FACTORY.toLowerCase()) {
  throw new Error(`Router factory mismatch: ${routerFactory}`);
}
if (routerWbnb.toLowerCase() !== WBNB.toLowerCase()) {
  throw new Error(`Router WBNB mismatch: ${routerWbnb}`);
}

const root = resolve(import.meta.dirname, "..");
function findImports(path) {
  const candidates = [path, path.replace(/^\.\//, "src/")];
  for (const candidate of candidates) {
    try {
      return { contents: readFileSync(resolve(root, candidate), "utf8") };
    } catch {
      // Continue.
    }
  }
  return { error: `Import not found: ${path}` };
}

const source = readFileSync(resolve(root, "src/BNBXFactory.sol"), "utf8");
const compiled = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: { "src/BNBXFactory.sol": { content: source } },
      settings: {
        optimizer: { enabled: true, runs: 200 },
        evmVersion: "shanghai",
        outputSelection: {
          "*": { "*": ["abi", "evm.bytecode.object"] },
        },
      },
    }),
    { import: findImports },
  ),
);
const errors = (compiled.errors ?? []).filter((item) => item.severity === "error");
if (errors.length) {
  throw new Error(errors.map((item) => item.formattedMessage).join("\n"));
}

const artifact = compiled.contracts["src/BNBXFactory.sol"].BNBXFactory;
const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: `0x${artifact.evm.bytecode.object}`,
  args: [feeRecipient, PANCAKE_V2_ROUTER],
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (!receipt.contractAddress || receipt.status !== "success") {
  throw new Error(`Factory deployment failed: ${hash}`);
}

const deployment = {
  chainId: CHAIN_ID,
  deploymentBlock: receipt.blockNumber.toString(),
  deployedAt: new Date().toISOString(),
  deployer: account.address,
  factory: receipt.contractAddress,
  feeRecipient,
  pancakeV2Router: PANCAKE_V2_ROUTER,
  pancakeV2Factory: PANCAKE_V2_FACTORY,
  wbnb: WBNB,
  transactionHash: hash,
};

const outputPath = resolve(root, "deployments/bsc-testnet.json");
writeFileSync(outputPath, `${JSON.stringify(deployment, null, 2)}\n`);
console.log(JSON.stringify(deployment, null, 2));
