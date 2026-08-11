import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("wires the foundation route and fixed entry into the public site", async () => {
  const [page, entry, layout, sitemap] = await Promise.all([
    read("../app/foundation/page.tsx"),
    read("../components/foundation-entry.tsx"),
    read("../app/layout.tsx"),
    read("../app/sitemap.ts"),
  ]);

  assert.match(page, /foundationShareholders/);
  assert.match(page, /foundationSummary/);
  assert.match(page, /FOUNDATION_MULTISIG_EXPLORER_URL/);
  assert.match(page, /navigator\.clipboard\.writeText\(FOUNDATION_MULTISIG_ADDRESS\)/);
  assert.match(entry, /href="\/foundation"/);
  assert.match(layout, /<FoundationEntry\s*\/>/);
  assert.match(sitemap, /"\/foundation"/);
});

test("keeps the public directory limited to the four approved columns", async () => {
  const [page, copy] = await Promise.all([
    read("../app/foundation/page.tsx"),
    read("./foundation-copy.ts"),
  ]);

  for (const column of ["number", "shareholder", "shares", "tokenAmount"]) {
    assert.match(page, new RegExp(`copy\\.${column}`));
  }
  assert.doesNotMatch(page, /shareholder\.address|walletAddress|releaseMilestone/);
  assert.doesNotMatch(copy, /市值达到|原地址释放|release milestone/i);
});

test("supports all site languages and responsive foundation styling", async () => {
  const [copy, styles] = await Promise.all([
    read("./foundation-copy.ts"),
    read("../app/globals.css"),
  ]);

  for (const language of ["zh", "en", "ko", "ja"]) {
    assert.match(copy, new RegExp(`${language}:\\s*\\{`));
  }
  assert.match(styles, /\.foundation-entry/);
  assert.match(styles, /\.foundation-directory-row/);
  assert.match(styles, /@media \(max-width: 719px\)[\s\S]*\.foundation-directory-row/);
});
