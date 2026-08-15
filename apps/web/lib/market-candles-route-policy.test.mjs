import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../app/api/market-candles/route.ts", import.meta.url),
  "utf8",
);

test("graduated candles come from a cached external endpoint without RPC", () => {
  assert.match(source, /api\.geckoterminal\.com/);
  assert.match(source, /\/api\/v2\/networks\/bsc\/pools/);
  assert.match(source, /revalidate:\s*60/);
  assert.doesNotMatch(source, /serverPublicClient|serverLogClient|getLogs/);
});
