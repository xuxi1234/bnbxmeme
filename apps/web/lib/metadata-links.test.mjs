import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sanitizeMetadataCommunityLinks } from "./metadata-links.ts";

test("hides the historical BNBX homepage placeholders", () => {
  assert.deepEqual(
    sanitizeMetadataCommunityLinks({
      website: "https://www.bnbx.meme/",
      telegram: "https://www.bnbx.meme/",
      twitter: "https://www.bnbx.meme/",
      debox: "https://www.bnbx.meme/",
    }),
    {
      website: undefined,
      telegram: undefined,
      twitter: undefined,
      debox: undefined,
    },
  );
});

test("keeps valid historical social links while hiding an invalid website", () => {
  assert.deepEqual(
    sanitizeMetadataCommunityLinks({
      website: "https://bnbxmeme/",
      telegram: "https://t.me/bnbxmeme",
      twitter: "https://x.com/bnbxmeme",
      debox: "https://m.debox.pro/bnbxmeme",
    }),
    {
      website: undefined,
      telegram: "https://t.me/bnbxmeme",
      twitter: "https://x.com/bnbxmeme",
      debox: "https://m.debox.pro/bnbxmeme",
    },
  );
});

test("requires each social button to target its named platform", () => {
  assert.deepEqual(
    sanitizeMetadataCommunityLinks({
      website: "https://project.example",
      telegram: "https://x.com/project",
      twitter: "https://t.me/project",
      debox: "https://example.com/project",
    }),
    {
      website: "https://project.example/",
      telegram: undefined,
      twitter: undefined,
      debox: undefined,
    },
  );
});

test("hides platform homepages and a website duplicated from a social link", () => {
  assert.deepEqual(
    sanitizeMetadataCommunityLinks({
      website: "https://x.com/project#profile",
      telegram: "https://t.me/",
      twitter: "https://x.com/project",
      debox: "https://debox.pro/",
    }),
    {
      website: undefined,
      telegram: undefined,
      twitter: "https://x.com/project",
      debox: undefined,
    },
  );
});

test("wires sanitized community links into token metadata rendering", async () => {
  const metadataSource = await readFile(
    new URL("./metadata.ts", import.meta.url),
    "utf8",
  );
  assert.match(metadataSource, /sanitizeMetadataCommunityLinks/);
  assert.match(metadataSource, /\.\.\.communityLinks/);
  assert.doesNotMatch(metadataSource, /telegram:\s*safeLink/);
});
