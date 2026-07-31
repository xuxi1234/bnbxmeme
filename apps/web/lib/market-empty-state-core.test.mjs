import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveMarketNoResults } from "./market-empty-state-core.ts";

test("distinguishes a trimmed search miss from an empty category", () => {
  assert.deepEqual(resolveMarketNoResults("  CZ  ", "newExternal"), {
    kind: "search",
    query: "CZ",
    filter: "newExternal",
    showHotAction: true,
  });
  assert.deepEqual(resolveMarketNoResults("   ", "graduating"), {
    kind: "filter",
    filter: "graduating",
    showHotAction: true,
  });
});

test("does not offer a redundant Hot reset while already in Hot Internal", () => {
  assert.deepEqual(resolveMarketNoResults("missing", "hotInternal"), {
    kind: "search",
    query: "missing",
    filter: "hotInternal",
    showHotAction: false,
  });
});

test("wires explanatory copy and both recovery actions into the market", async () => {
  const [source, messages] = await Promise.all([
    readFile(
      new URL("../components/token-market.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/language-provider.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(source, /resolveMarketNoResults\(query, filter\)/);
  assert.match(source, /t\("searchNoResultsTitle"\)/);
  assert.match(source, /t\("searchNoResultsHelp"\)/);
  assert.match(source, /t\("filterNoResultsTitle"\)/);
  assert.match(source, /t\("filterNoResultsHelp"\)/);
  assert.match(source, /setQuery\(""\)/);
  assert.match(source, /chooseFilter\("hotInternal"\)/);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
  assert.equal(
    messages.match(/searchNoResultsTitle:\s*"[^"\n]*\{query\}/g)?.length,
    4,
  );
  assert.equal(
    messages.match(/searchNoResultsHelp:\s*"[^"\n]*\{filter\}/g)?.length,
    4,
  );
  assert.equal(
    messages.match(/filterNoResultsTitle:\s*"[^"\n]*\{filter\}/g)?.length,
    4,
  );
});
