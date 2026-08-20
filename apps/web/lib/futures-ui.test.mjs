import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  FUTURES_COPY,
  buildFuturesOrder,
  classifyMarginRisk,
  formatFuturesDecimal,
} from "./futures-ui-core.ts";

const locales = ["zh", "en", "ko", "ja"];
const root = new URL("../", import.meta.url);

test("keeps every Futures surface field-complete in four languages", () => {
  const baseline = Object.keys(FUTURES_COPY.zh).sort();
  for (const locale of locales) {
    assert.deepEqual(Object.keys(FUTURES_COPY[locale]).sort(), baseline);
    for (const value of Object.values(FUTURES_COPY[locale])) {
      assert.equal(typeof value, "string");
      assert.ok(value.trim().length > 0);
    }
  }
  assert.match(FUTURES_COPY.en.testnetAssetWarning, /test/i);
  assert.match(FUTURES_COPY.zh.testnetAssetWarning, /测试/);
  assert.doesNotMatch(FUTURES_COPY.en.testUsdt, /^USDT$/);
});

test("builds exact BSC testnet EIP-712 order economics", () => {
  const order = buildFuturesOrder({
    trader: "0x1111111111111111111111111111111111111111",
    side: "short",
    role: "taker",
    quantity: "1.25",
    limitPrice: "0.5",
    leverage: 3,
    reduceOnly: true,
    nonce: 17,
    deadline: 2_000_000_000,
  });
  assert.deepEqual(order, {
    trader: "0x1111111111111111111111111111111111111111",
    side: 1,
    quantity: "1250000000000000000",
    limitPrice: "500000000000000000",
    leverage: 3,
    nonce: "17",
    deadline: "2000000000",
    reduceOnly: true,
    role: 1,
  });
  assert.throws(() =>
    buildFuturesOrder({
      trader: "0x1111111111111111111111111111111111111111",
      side: "long",
      role: "maker",
      quantity: "0",
      limitPrice: "1",
      leverage: 4,
      reduceOnly: false,
      nonce: 1,
      deadline: 2_000_000_000,
    }),
  );
});

test("shows conservative margin risk and bounded decimal values", () => {
  assert.equal(classifyMarginRisk("2500", false), "healthy");
  assert.equal(classifyMarginRisk("2000", false), "warning");
  assert.equal(classifyMarginRisk("2600", true), "liquidation");
  assert.equal(formatFuturesDecimal("1234500000000000000", 18, 4), "1.2345");
  assert.equal(formatFuturesDecimal("-250000000000000000", 18, 4), "-0.25");
  assert.equal(formatFuturesDecimal(undefined, 18, 4), "—");
});

test("wires the noindex responsive Futures route to every required workflow", () => {
  const page = readFileSync(new URL("app/futures/page.tsx", root), "utf8");
  const layout = readFileSync(new URL("app/futures/layout.tsx", root), "utf8");
  const consoleSource = readFileSync(
    new URL("components/futures-console.tsx", root),
    "utf8",
  );
  const css = readFileSync(new URL("app/futures/futures.css", root), "utf8");
  const robots = readFileSync(new URL("app/robots.ts", root), "utf8");

  assert.match(layout, /index:\s*false/);
  assert.match(robots, /["']\/futures["']/);
  assert.match(page, /FuturesConsole/);
  for (const resource of [
    "market-status",
    "orders",
    "fills",
    "positions",
    "collateral-intents",
    "keeper-health",
  ]) {
    assert.match(consoleSource, new RegExp(resource));
  }
  assert.match(consoleSource, /useSignTypedData/);
  assert.match(consoleSource, /useSendTransaction/);
  assert.match(consoleSource, /api<CancellationIntent>\("cancellations"/);
  assert.match(consoleSource, /sendTransactionAsync\(\{[\s\S]*result\.data\.calldata/);
  assert.match(consoleSource, /waitForTransactionReceipt\(\{ hash \}\)/);
  assert.match(consoleSource, /useSwitchChain/);
  assert.match(consoleSource, /bscTestnet\.id/);
  assert.match(consoleSource, /approve/);
  assert.match(consoleSource, /reduceOnly/);
  assert.match(consoleSource, /marginRatioBps/);
  assert.match(consoleSource, /liquidationPrice/);
  assert.match(consoleSource, /liquidatable/);
  assert.match(consoleSource, /const canWrite/);
  assert.match(consoleSource, /MAX_ORACLE_AGE_SECONDS\s*=\s*3_900/);
  assert.match(consoleSource, /setAuthenticated\(false\)[\s\S]*chainId/);
  assert.doesNotMatch(
    consoleSource,
    /cause instanceof Error \? cause\.message/,
  );
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /\.futures-workspace/);
});

test("shows every order lifecycle state in all four languages", () => {
  for (const locale of locales) {
    for (const key of [
      "awaitingCounterparty",
      "relayerSubmitting",
      "included",
      "confirmed",
      "failed",
    ]) {
      assert.equal(typeof FUTURES_COPY[locale][key], "string");
      assert.ok(FUTURES_COPY[locale][key].length > 0);
    }
  }
});
