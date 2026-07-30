import assert from "node:assert/strict";
import test from "node:test";
import { resolveLpBurnStatus } from "./lp-security-core.ts";

const pair = "0x1111111111111111111111111111111111111111";
const zero = "0x0000000000000000000000000000000000000000";

test("keeps LP burn status pending until the Curve graduates", () => {
  assert.equal(
    resolveLpBurnStatus({ curveState: 0, pair, burnBalance: undefined }),
    "pending",
  );
  assert.equal(
    resolveLpBurnStatus({ curveState: 1, pair, burnBalance: 0n }),
    "pending",
  );
});

test("only reports burned when the graduated Pair has burn-address LP", () => {
  assert.equal(
    resolveLpBurnStatus({ curveState: 2, pair, burnBalance: 1n }),
    "burned",
  );
  assert.equal(
    resolveLpBurnStatus({ curveState: 2, pair, burnBalance: 0n }),
    "missing",
  );
});

test("does not invent an LP safety conclusion from incomplete chain data", () => {
  assert.equal(
    resolveLpBurnStatus({
      curveState: 2,
      pair: undefined,
      burnBalance: 1n,
    }),
    "unknown",
  );
  assert.equal(
    resolveLpBurnStatus({ curveState: 2, pair: zero, burnBalance: 1n }),
    "unknown",
  );
  assert.equal(
    resolveLpBurnStatus({ curveState: 2, pair, burnBalance: undefined }),
    "unknown",
  );
});
