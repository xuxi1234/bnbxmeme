import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chainDataUrl, fetchSharedChainData } from "./shared-chain-data.ts";

const curve = "0x1111111111111111111111111111111111111111";
const token = "0x2222222222222222222222222222222222222222";
const pair = "0x3333333333333333333333333333333333333333";
const zeroAddress = "0x0000000000000000000000000000000000000000";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

test("builds one canonical URL and omits a zero pair", () => {
  assert.equal(
    chainDataUrl({ curve, token, pair }),
    `/api/chain-data?curve=${curve}&token=${token}&pair=${pair}`,
  );
  assert.equal(
    chainDataUrl({ curve, token, pair: zeroAddress }),
    `/api/chain-data?curve=${curve}&token=${token}`,
  );
});

test("coalesces identical concurrent requests", async () => {
  const originalFetch = globalThis.fetch;
  const response = deferred();
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return response.promise;
  };

  try {
    const first = fetchSharedChainData({ curve, token, pair });
    const second = fetchSharedChainData({ curve, token, pair });
    const payload = { trades: [{ id: "shared" }] };

    assert.equal(fetchCalls, 1);
    response.resolve({
      ok: true,
      json: async () => payload,
    });
    assert.deepEqual(await first, payload);
    assert.deepEqual(await second, payload);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("aborting one consumer does not cancel the shared request", async () => {
  const originalFetch = globalThis.fetch;
  const response = deferred();
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return response.promise;
  };

  try {
    const controller = new AbortController();
    const cancelled = fetchSharedChainData(
      { curve, token, pair },
      controller.signal,
    );
    const active = fetchSharedChainData({ curve, token, pair });
    controller.abort();

    await assert.rejects(cancelled, { name: "AbortError" });
    assert.equal(fetchCalls, 1);

    const payload = { trades: [{ id: "active" }] };
    response.resolve({
      ok: true,
      json: async () => payload,
    });
    assert.deepEqual(await active, payload);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("starts a fresh request after the shared request settles", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      json: async () => ({ fetchCalls }),
    };
  };

  try {
    assert.deepEqual(await fetchSharedChainData({ curve, token, pair }), {
      fetchCalls: 1,
    });
    assert.deepEqual(await fetchSharedChainData({ curve, token, pair }), {
      fetchCalls: 2,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("both token detail consumers use the shared chain-data request", async () => {
  const sources = await Promise.all([
    readFile(
      new URL("../components/bonding-curve-chart.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/token-activity.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  for (const source of sources) {
    assert.match(source, /fetchSharedChainData/);
    assert.doesNotMatch(source, /fetch\(\s*`\/api\/chain-data/);
  }
});
