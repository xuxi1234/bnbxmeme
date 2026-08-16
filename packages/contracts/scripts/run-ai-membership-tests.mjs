import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import solc from "solc";
import ganache from "ganache";
import {
  createPublicClient,
  custom,
  defineChain,
  encodeDeployData,
  encodeFunctionData,
  parseEther,
} from "viem";

const source = await readFile(
  new URL("../src/BNBXAiMembership.sol", import.meta.url),
  "utf8",
);
const input = {
  language: "Solidity",
  sources: { "BNBXAiMembership.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "shanghai",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter(
  (entry) => entry.severity === "error",
);
assert.deepEqual(errors, []);
const artifact = output.contracts["BNBXAiMembership.sol"].BNBXAiMembership;

const provider = ganache.provider({
  logging: { quiet: true },
  wallet: { totalAccounts: 8, defaultBalance: 100 },
  chain: { chainId: 31_337 },
});
const localChain = defineChain({
  id: 31_337,
  name: "Ganache",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1"] } },
});
const accounts = (await provider.request({ method: "eth_accounts" })).map(
  (address) => address.toLowerCase(),
);
const [deployer, treasury, root, first, second, outsider] = accounts;
const publicClient = createPublicClient({
  chain: localChain,
  transport: custom(provider),
});
async function send(account, request) {
  const hash = await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: account,
        to: request.address,
        gas: "0x1e8480",
        value: request.value ? `0x${request.value.toString(16)}` : "0x0",
        data: encodeFunctionData({
          abi: request.abi,
          functionName: request.functionName,
          args: request.args ?? [],
        }),
      },
    ],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  return receipt;
}

const deployHash = await provider.request({
  method: "eth_sendTransaction",
  params: [
    {
      from: deployer,
      gas: "0x7a1200",
      data: encodeDeployData({
        abi: artifact.abi,
        bytecode: `0x${artifact.evm.bytecode.object}`,
        args: [treasury, [root]],
      }),
    },
  ],
});
const deployReceipt = await publicClient.waitForTransactionReceipt({
  hash: deployHash,
});
const address = deployReceipt.contractAddress;
assert.ok(address);

const contract = { address, abi: artifact.abi };
assert.equal(
  await publicClient.readContract({
    ...contract,
    functionName: "MEMBERSHIP_PRICE",
  }),
  parseEther("0.1"),
);
assert.equal(
  await publicClient.readContract({
    ...contract,
    functionName: "LEVEL_ONE_REWARD",
  }),
  parseEther("0.05"),
);
assert.equal(
  await publicClient.readContract({
    ...contract,
    functionName: "LEVEL_TWO_REWARD",
  }),
  parseEther("0.025"),
);
assert.equal(
  await publicClient.readContract({
    ...contract,
    functionName: "isMember",
    args: [root],
  }),
  true,
);

await send(first, {
  ...contract,
  functionName: "openMembership",
  args: [root],
  value: parseEther("0.1"),
});
await send(second, {
  ...contract,
  functionName: "openMembership",
  args: [first],
  value: parseEther("0.1"),
});
assert.equal(
  await publicClient.readContract({
    ...contract,
    functionName: "claimableRewards",
    args: [first],
  }),
  parseEther("0.05"),
);
assert.equal(
  await publicClient.readContract({
    ...contract,
    functionName: "claimableRewards",
    args: [root],
  }),
  parseEther("0.075"),
);
assert.equal(
  await publicClient.getBalance({ address: treasury }),
  parseEther("100.075"),
);

await send(outsider, {
  ...contract,
  functionName: "openMembership",
  args: ["0x0000000000000000000000000000000000000000"],
  value: parseEther("0.1"),
});
assert.equal(
  await publicClient.getBalance({ address: treasury }),
  parseEther("100.175"),
);

await assert.rejects(
  send(accounts[6], {
    ...contract,
    functionName: "openMembership",
    args: [accounts[6]],
    value: parseEther("0.1"),
  }),
);
await assert.rejects(
  send(accounts[7], {
    ...contract,
    functionName: "openMembership",
    args: [accounts[6]],
    value: parseEther("0.1"),
  }),
);
await assert.rejects(
  send(first, {
    ...contract,
    functionName: "openMembership",
    args: [root],
    value: parseEther("0.1"),
  }),
);

const before = await publicClient.getBalance({ address: first });
await send(first, { ...contract, functionName: "withdrawRewards", args: [] });
const after = await publicClient.getBalance({ address: first });
assert.ok(after > before);
assert.equal(
  await publicClient.readContract({
    ...contract,
    functionName: "claimableRewards",
    args: [first],
  }),
  0n,
);

console.log(
  "PASS BNBXAiMembership exact 50/25/25 distribution, empty layers, referral safety, and pull withdrawals",
);
