import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("shows each token name before USDT in every localized chart unit", async () => {
  const [messages, chart, tokenPage] = await Promise.all([
    readFile(
      new URL("../components/language-provider.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/bonding-curve-chart.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/token/[address]/token-trading-page.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.equal(
    messages.match(/priceUnit: "[^"]*\{tokenName\} \/ USDT"/g)?.length,
    4,
  );
  assert.doesNotMatch(messages, /USDT \/ 1 枚代币|USDT per token/);
  assert.match(chart, /name: string/);
  assert.match(chart, /interpolate\(t\("priceUnit"\), \{ tokenName: name \}\)/);
  assert.match(tokenPage, /name=\{tokenName \?\? tokenSymbol \?\? "—"\}/);
});
