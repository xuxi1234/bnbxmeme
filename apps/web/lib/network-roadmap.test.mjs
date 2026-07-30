import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  LIVE_NETWORK,
  networkRoadmapCopy,
  ROADMAP_NETWORKS,
} from "./network-roadmap.ts";

const languages = ["zh", "en", "ko", "ja"];

test("keeps BNB Chain as the only live selectable network", () => {
  assert.equal(LIVE_NETWORK.name, "BNB Chain");
  assert.equal(LIVE_NETWORK.short, "BSC");
  assert.ok(ROADMAP_NETWORKS.every((network) => network.name !== "BNB Chain"));
  assert.equal(
    new Set(ROADMAP_NETWORKS.map((network) => network.name)).size,
    ROADMAP_NETWORKS.length,
  );
});

test("moves every previously advertised unsupported network to the roadmap", () => {
  assert.deepEqual(
    ROADMAP_NETWORKS.map((network) => network.name),
    [
      "Ethereum",
      "Base",
      "Arbitrum",
      "Optimism",
      "Solana",
      "Polygon",
      "Avalanche",
      "Monad",
      "Sui",
      "TON",
      "X Layer",
      "Linea",
    ],
  );
});

test("keeps roadmap guidance complete in four languages", () => {
  assert.deepEqual(
    Object.keys(networkRoadmapCopy).sort(),
    [...languages].sort(),
  );
  const expectedKeys = Object.keys(networkRoadmapCopy.zh).sort();
  for (const language of languages) {
    assert.deepEqual(
      Object.keys(networkRoadmapCopy[language]).sort(),
      expectedKeys,
    );
    for (const value of Object.values(networkRoadmapCopy[language])) {
      assert.ok(value.trim());
    }
  }
});

test("shows only BNB Chain in the selector and links candidates to the roadmap", async () => {
  const [menu, page, layout, footer] = await Promise.all([
    readFile(
      new URL("../components/network-menu.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/roadmap/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/roadmap/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/site-footer.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(menu, /LIVE_NETWORK/);
  assert.match(menu, /href="\/roadmap"/);
  assert.doesNotMatch(menu, /ROADMAP_NETWORKS/);
  assert.doesNotMatch(menu, /\bdisabled\b/);
  assert.doesNotMatch(menu, /comingSoon/);
  assert.match(page, /ROADMAP_NETWORKS\.map/);
  assert.match(layout, /buildPageMetadata\("\/roadmap"\)/);
  assert.match(footer, /href="\/roadmap"/);
});
