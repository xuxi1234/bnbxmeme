import assert from "node:assert/strict";
import test from "node:test";
import {
  PUBLIC_QUOTE_CHAIN_ID,
  publicQuoteReadConfig,
} from "./trade-quote-core.ts";

const curve = "0x1111111111111111111111111111111111111111";
const zero = "0x0000000000000000000000000000000000000000";

test("routes public trade quotes to BNB Mainnet without wallet state", () => {
  assert.deepEqual(
    publicQuoteReadConfig({ curveAddress: curve, amountWei: 1n }),
    { chainId: 56, enabled: true },
  );
  assert.equal(PUBLIC_QUOTE_CHAIN_ID, 56);
});

test("does not query a missing Curve or a zero quote amount", () => {
  assert.equal(
    publicQuoteReadConfig({ curveAddress: zero, amountWei: 1n }).enabled,
    false,
  );
  assert.equal(
    publicQuoteReadConfig({ curveAddress: curve, amountWei: 0n }).enabled,
    false,
  );
});
