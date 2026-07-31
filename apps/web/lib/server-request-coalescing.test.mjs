import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createInFlightRequestCoalescer } from "./server-request-coalescing.ts";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

test("coalesces identical requests while work is in flight", async () => {
  const coalesce = createInFlightRequestCoalescer();
  const pending = deferred();
  let calls = 0;
  const work = () => {
    calls += 1;
    return pending.promise;
  };

  const first = coalesce("token-a", work);
  const second = coalesce("token-a", work);
  await Promise.resolve();
  assert.equal(calls, 1);

  pending.resolve({ source: "shared" });
  assert.deepEqual(await first, { source: "shared" });
  assert.deepEqual(await second, { source: "shared" });
});

test("keeps different request identities independent", async () => {
  const coalesce = createInFlightRequestCoalescer();
  let calls = 0;

  const [first, second] = await Promise.all([
    coalesce("token-a", async () => ++calls),
    coalesce("token-b", async () => ++calls),
  ]);

  assert.equal(calls, 2);
  assert.deepEqual(new Set([first, second]), new Set([1, 2]));
});

test("does not retain a completed request as a response cache", async () => {
  const coalesce = createInFlightRequestCoalescer();
  let calls = 0;
  const work = async () => ++calls;

  assert.equal(await coalesce("token-a", work), 1);
  assert.equal(await coalesce("token-a", work), 2);
});

test("removes failed work so the next request can retry", async () => {
  const coalesce = createInFlightRequestCoalescer();
  let calls = 0;

  await assert.rejects(
    coalesce("token-a", async () => {
      calls += 1;
      throw new Error("temporary failure");
    }),
    /temporary failure/,
  );
  assert.equal(
    await coalesce("token-a", async () => {
      calls += 1;
      return "recovered";
    }),
    "recovered",
  );
  assert.equal(calls, 2);
});

test("wires canonical request coalescing into the chain-data route", async () => {
  const source = await readFile(
    new URL("../app/api/chain-data/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /const key = \[curve, token, pair \?\? ""\][\s\S]*address\.toLowerCase\(\)/,
  );
  assert.match(source, /coalesceChainDataRequest\(key/);
  assert.match(source, /return response\.clone\(\)/);
});
