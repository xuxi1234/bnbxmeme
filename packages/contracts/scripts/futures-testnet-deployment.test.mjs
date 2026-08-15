import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getContractAddress } from "viem";
import {
  assertFuturesTestnetManifest,
  buildFuturesDeploymentPlan,
  parseFuturesTestnetConfig,
} from "./futures-testnet-core.mjs";

const address = (byte) => `0x${byte.repeat(40)}`;
const hash = (byte) => `0x${byte.repeat(64)}`;
const env = {
  BSC_TESTNET_RPC_URL: "https://rpc.example.test",
  DEPLOYER_PRIVATE_KEY: `0x${"11".repeat(32)}`,
  BSC_SCAN_API_KEY: "scan-key",
  FUTURES_TEST_USDT: address("1"),
  FUTURES_TEST_BNBX: address("2"),
  FUTURES_TEST_WBNB: address("3"),
  FUTURES_TEST_BNBX_WBNB_PAIR: address("4"),
  FUTURES_TEST_BNB_USD_FEED: address("5"),
  FUTURES_GUARDIAN: address("6"),
  FUTURES_REVENUE_RECIPIENT: address("7"),
  FUTURES_TOTAL_LIABILITY_CAP: "1000000000000000000000000",
  FUTURES_ACCOUNT_EQUITY_CAP: "10000000000000000000000",
  FUTURES_OPEN_INTEREST_CAP: "1000000000000000000000000",
};

test("requires every explicit BSC testnet dependency without mainnet defaults", () => {
  const config = parseFuturesTestnetConfig(env, { requireSecrets: true });
  assert.equal(config.chainId, 97);
  assert.equal(config.testUsdt, env.FUTURES_TEST_USDT);
  assert.equal(config.testBnbx, env.FUTURES_TEST_BNBX);
  for (const key of Object.keys(env)) {
    const incomplete = { ...env };
    delete incomplete[key];
    assert.throws(() =>
      parseFuturesTestnetConfig(incomplete, { requireSecrets: true }),
    );
  }
  assert.throws(() =>
    parseFuturesTestnetConfig(
      { ...env, FUTURES_TEST_USDT: env.FUTURES_TEST_BNBX },
      { requireSecrets: true },
    ),
  );
  assert.throws(() =>
    parseFuturesTestnetConfig(
      { ...env, FUTURES_TEST_USDT: address("0") },
      { requireSecrets: true },
    ),
  );
  assert.throws(() =>
    parseFuturesTestnetConfig(
      { ...env, FUTURES_TOTAL_LIABILITY_CAP: (1n << 256n).toString() },
      { requireSecrets: true },
    ),
  );
});

test("predicts the five cyclic Futures dependencies from one nonce", () => {
  const deployer = address("a");
  const plan = buildFuturesDeploymentPlan(deployer, 20n);
  assert.deepEqual(
    plan.map(({ contract, nonce }) => [contract, nonce]),
    [
      ["RiskEngine", 20n],
      ["ClearingHouse", 21n],
      ["FuturesOracle", 22n],
      ["SafetyController", 23n],
      ["OrderBook", 24n],
    ],
  );
  assert.equal(
    plan[4].address.toLowerCase(),
    getContractAddress({ from: deployer, nonce: 24n }).toLowerCase(),
  );
});

test("accepts only a chain-97 manifest bound to test assets and runtime proofs", () => {
  const deployer = address("a");
  const plan = buildFuturesDeploymentPlan(deployer, 20n);
  const deployed = Object.fromEntries(
    plan.map((entry) => [entry.contract, entry]),
  );
  const args = {
    RiskEngine: [],
    ClearingHouse: [
      env.FUTURES_TEST_USDT,
      deployed.RiskEngine.address,
      deployed.OrderBook.address,
      deployed.SafetyController.address,
      env.FUTURES_REVENUE_RECIPIENT,
      env.FUTURES_TOTAL_LIABILITY_CAP,
      env.FUTURES_ACCOUNT_EQUITY_CAP,
      env.FUTURES_OPEN_INTEREST_CAP,
    ],
    FuturesOracle: [
      env.FUTURES_TEST_BNBX_WBNB_PAIR,
      env.FUTURES_TEST_BNB_USD_FEED,
      env.FUTURES_TEST_BNBX,
      env.FUTURES_TEST_WBNB,
      deployed.SafetyController.address,
    ],
    SafetyController: [
      env.FUTURES_GUARDIAN,
      deployed.ClearingHouse.address,
      deployed.FuturesOracle.address,
    ],
    OrderBook: [
      deployed.ClearingHouse.address,
      deployed.RiskEngine.address,
      deployed.FuturesOracle.address,
    ],
  };
  const manifest = {
    schema: "bnbx-futures-testnet-deployment/v1",
    chainId: 97,
    deployedAt: "2026-08-15T00:00:00.000Z",
    deployer,
    assets: {
      testUsdt: env.FUTURES_TEST_USDT,
      testBnbx: env.FUTURES_TEST_BNBX,
      wbnb: env.FUTURES_TEST_WBNB,
      pair: env.FUTURES_TEST_BNBX_WBNB_PAIR,
      bnbUsdFeed: env.FUTURES_TEST_BNB_USD_FEED,
    },
    roles: {
      guardian: env.FUTURES_GUARDIAN,
      revenueRecipient: env.FUTURES_REVENUE_RECIPIENT,
    },
    caps: {
      totalLiability: env.FUTURES_TOTAL_LIABILITY_CAP,
      accountEquity: env.FUTURES_ACCOUNT_EQUITY_CAP,
      matchedOpenInterest: env.FUTURES_OPEN_INTEREST_CAP,
    },
    compiler: "0.8.30+commit.73712a01.Emscripten.clang",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "shanghai",
    },
    entries: plan.map((entry, index) => ({
      contract: entry.contract,
      source: `src/futures/${entry.contract}.sol`,
      address: entry.address,
      nonce: entry.nonce.toString(),
      transactionHash: hash(`${index + 1}`),
      constructorArgs: args[entry.contract],
      constructorArgsEncoded: "0x",
      runtimeBytes: 100 + index,
      runtimeBytecodeHash: hash("a"),
      deployedRuntimeBytecodeHash: hash("a"),
    })),
  };
  assert.doesNotThrow(() => assertFuturesTestnetManifest(manifest));
  assert.throws(() =>
    assertFuturesTestnetManifest({ ...manifest, chainId: 56 }),
  );
  assert.throws(() =>
    assertFuturesTestnetManifest({
      ...manifest,
      entries: manifest.entries.slice(1),
    }),
  );
});

test("deployment scripts preserve preflight, verification, and acceptance gates", () => {
  const root = resolve(import.meta.dirname);
  const preflight = readFileSync(
    resolve(root, "futures-testnet-preflight.mjs"),
    "utf8",
  );
  const deploy = readFileSync(
    resolve(root, "futures-testnet-deploy.mjs"),
    "utf8",
  );
  const verify = readFileSync(
    resolve(root, "futures-testnet-verify-source.mjs"),
    "utf8",
  );
  const acceptance = readFileSync(
    resolve(root, "futures-testnet-acceptance.mjs"),
    "utf8",
  );
  assert.match(preflight, /getChainId/);
  assert.match(preflight, /97/);
  assert.match(preflight, /getBalance/);
  assert.match(preflight, /futures-build\.mjs/);
  assert.match(preflight, /latestRoundData/);
  assert.match(preflight, /getReserves/);
  assert.match(preflight, /price0CumulativeLast/);
  assert.match(deploy, /runFuturesTestnetPreflight/);
  assert.match(deploy, /waitForTransactionReceipt/);
  assert.match(deploy, /deployedRuntimeBytecodeHash/);
  assert.match(deploy, /assertFuturesTestnetManifest/);
  assert.match(verify, /verifysourcecode/);
  assert.match(verify, /solidity-standard-json-input/);
  assert.match(acceptance, /domainSeparator/);
  assert.match(acceptance, /EIP712Domain/);
  assert.match(acceptance, /getTransactionReceipt/);
  assert.match(acceptance, /getTransaction/);
  assert.match(acceptance, /validateFuturesOracleDependencies/);
  assert.match(acceptance, /runtimeBytecodeHash/);
  for (const source of [preflight, deploy, verify, acceptance]) {
    assert.doesNotMatch(source, /(?:chainId|id)\s*[:=]\s*56\b/);
    assert.doesNotMatch(source, /0x55d398326f99059fF775485246999027B3197955/);
  }
});
