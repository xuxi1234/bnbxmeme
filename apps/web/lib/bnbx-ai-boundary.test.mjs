import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [boundary, route] = await Promise.all([
  readFile(new URL("bnbx-ai-boundary.ts", import.meta.url), "utf8"),
  readFile(
    new URL("../app/api/bnbx-ai/chat/route.ts", import.meta.url),
    "utf8",
  ),
]);

test("blocks political and religious topics in four interface languages", () => {
  for (const term of [
    "政治",
    "习近平",
    "川普",
    "王子文",
    "religion",
    "Donald Trump",
    "president",
    "정치",
    "대통령",
    "宗教",
    "大統領",
  ]) {
    assert.match(
      boundary.toLocaleLowerCase(),
      new RegExp(term.toLocaleLowerCase()),
    );
  }
  for (const language of ["zh", "en", "ko", "ja"]) {
    assert.match(boundary, new RegExp(`\\b${language}:`));
  }
});

test("normalizes spacing and punctuation used to evade the boundary", () => {
  assert.match(boundary, /normalize\("NFKC"\)/);
  assert.match(boundary, /const compact/);
  assert.match(boundary, /normalized\.includes/);
  assert.match(boundary, /compact\.includes/);
});

test("keeps the platform-specific blocked-name boundary", () => {
  assert.match(boundary, /王子文/);
});

test("refuses before quota consumption and the OpenAI provider call", () => {
  const guard = route.indexOf("involvesPoliticsOrReligion");
  assert.ok(guard > -1);
  assert.ok(guard < route.indexOf("consumeAiQuota", guard));
  assert.ok(guard < route.indexOf("/chat/completions"));
  assert.match(route, /refused: true/);
});

test("keeps a model-level backstop against aliases and prompt injection", () => {
  assert.match(route, /political figures/);
  assert.match(route, /religious figures/);
  assert.match(route, /aliases, obfuscation/);
  assert.match(route, /ignore these rules/);
});
