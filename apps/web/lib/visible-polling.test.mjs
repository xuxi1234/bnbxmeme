import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { startVisiblePolling } from "./visible-polling.ts";

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

test("polls only in a visible tab and refreshes immediately on return", async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  let intervalCallback;
  let visibilityCallback;
  let clearedTimer;
  let removedListener;
  const fakeDocument = {
    visibilityState: "visible",
    addEventListener: (event, callback) => {
      assert.equal(event, "visibilitychange");
      visibilityCallback = callback;
    },
    removeEventListener: (event, callback) => {
      assert.equal(event, "visibilitychange");
      removedListener = callback;
    },
  };
  globalThis.window = {
    setInterval: (callback, intervalMs) => {
      assert.equal(intervalMs, 15_000);
      intervalCallback = callback;
      return 42;
    },
    clearInterval: (timer) => {
      clearedTimer = timer;
    },
  };
  globalThis.document = fakeDocument;

  try {
    let calls = 0;
    let finishFirstPoll;
    const stop = startVisiblePolling(() => {
      calls += 1;
      if (calls === 1) {
        return new Promise((resolve) => {
          finishFirstPoll = resolve;
        });
      }
    }, 15_000);
    assert.equal(calls, 1);

    intervalCallback();
    await flushPromises();
    assert.equal(calls, 1);
    finishFirstPoll();
    await flushPromises();

    fakeDocument.visibilityState = "hidden";
    intervalCallback();
    await flushPromises();
    assert.equal(calls, 1);

    fakeDocument.visibilityState = "visible";
    visibilityCallback();
    await flushPromises();
    assert.equal(calls, 2);

    stop();
    assert.equal(clearedTimer, 42);
    assert.equal(removedListener, visibilityCallback);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test("wires visible polling into every production API poller", async () => {
  const sources = await Promise.all([
    readFile(
      new URL("../components/bonding-curve-chart.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/token-activity.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/token-market.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/token/[address]/token-trading-page.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  for (const source of sources) {
    assert.match(source, /startVisiblePolling/);
  }
});

test("polls market scores independently once per five minutes", async () => {
  const source = await readFile(
    new URL("../components/token-market.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /const SCORE_POLL_INTERVAL_MS = 300_000/);
  assert.match(
    source,
    /startVisiblePolling\(\s*refreshScores,\s*SCORE_POLL_INTERVAL_MS,\s*\)/,
  );
  assert.match(source, /\[indexReloadKey, scoreRefreshKey\]/);
});

test("refreshes the market catalog every thirty seconds", async () => {
  const market = await readFile(
    new URL("../components/token-market.tsx", import.meta.url),
    "utf8",
  );
  const trading = await readFile(
    new URL("../app/token/[address]/token-trading-page.tsx", import.meta.url),
    "utf8",
  );
  const chart = await readFile(
    new URL("../components/bonding-curve-chart.tsx", import.meta.url),
    "utf8",
  );
  const activity = await readFile(
    new URL("../components/token-activity.tsx", import.meta.url),
    "utf8",
  );

  assert.match(market, /startVisiblePolling\([\s\S]*?loadMarket[\s\S]*?30_000/);
  assert.doesNotMatch(market, /creator \? 60_000 : 15_000/);
  assert.match(trading, /startVisiblePolling\(load, 60_000\)/);
  assert.match(chart, /startVisiblePolling\(load, 60_000\)/);
  assert.match(activity, /startVisiblePolling\(load, 60_000\)/);
});

test("home market scores use cache-only chain data", async () => {
  const source = await readFile(
    new URL("../components/token-market.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /\/api\/chain-data\?mode=cache&curve=/);
});

test("new launches refresh through a bounded thirty second CDN cache", async () => {
  const source = await readFile(
    new URL("../app/api/market-data/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /"Cache-Control": "no-store"[\s\S]*?"CDN-Cache-Control":\s*"public, s-maxage=30, stale-while-revalidate=30"/,
  );
});

test("market catalog requests bypass a browser's previously cached response", async () => {
  const source = await readFile(
    new URL("../components/token-market.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /fetch\(endpoint, \{ signal, cache: "no-store" \}\)/,
  );
});

test("does not restart activity polling when result counts change", async () => {
  const source = await readFile(
    new URL("../components/token-activity.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /const hasActivityData = useRef\(false\)/);
  assert.match(source, /if \(!hasActivityData\.current\) setIsLoading\(true\)/);
  assert.match(source, /hasActivityData\.current = true/);
  assert.doesNotMatch(
    source,
    /\}, \[[^\]]*(?:holders|trades)\.length[^\]]*\]\);/,
  );
});
