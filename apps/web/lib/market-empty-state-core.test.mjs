import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveMarketNoResults } from "./market-empty-state-core.ts";

test("distinguishes a trimmed search miss from an empty category", () => {
  assert.deepEqual(resolveMarketNoResults("  CZ  ", "graduated"), {
    kind: "search",
    query: "CZ",
    filter: "graduated",
    showHotAction: true,
  });
  assert.deepEqual(resolveMarketNoResults("   ", "graduating"), {
    kind: "filter",
    filter: "graduating",
    showHotAction: true,
  });
});

test("does not offer a redundant Hot reset while already in Hot", () => {
  assert.deepEqual(resolveMarketNoResults("missing", "hot"), {
    kind: "search",
    query: "missing",
    filter: "hot",
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
  assert.match(source, /chooseFilter\("hot"\)/);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
  assert.equal(
    messages.match(/searchNoResultsTitle:[^\n]*\{query\}/g)?.length,
    4,
  );
  assert.equal(
    messages.match(/searchNoResultsHelp:[^\n]*\{filter\}/g)?.length,
    4,
  );
  assert.equal(
    messages.match(/filterNoResultsTitle:[^\n]*\{filter\}/g)?.length,
    4,
  );
});
