import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("publishes crawler rules without exposing private application surfaces", async () => {
  const source = await readFile(
    new URL("../app/robots.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /SITE_URL/);
  assert.match(source, /sitemap\.xml/);
  assert.match(source, /allow:\s*"\/"/);
  for (const path of [
    "/admin/",
    "/api/",
    "/deploy-lp-rewards-mainnet",
    "/deploy-mainnet",
    "/deploy-testnet",
  ]) {
    assert.match(source, new RegExp(JSON.stringify(path)));
  }
});

test("marks internal application pages as noindex and nofollow", async () => {
  for (const path of [
    "../app/admin/moderation/layout.tsx",
    "../app/deploy-lp-rewards-mainnet/layout.tsx",
    "../app/deploy-mainnet/layout.tsx",
    "../app/deploy-testnet/layout.tsx",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");

    assert.match(source, /robots:\s*\{/);
    assert.match(source, /index:\s*false/);
    assert.match(source, /follow:\s*false/);
  }
});

test("publishes public pages, official tokens, and real creators in the sitemap", async () => {
  const source = await readFile(
    new URL("../app/sitemap.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /readOfficialTokenCatalog/);
  assert.match(source, /readOfficialCreatorAddresses/);
  assert.match(source, /Promise\.all/);
  assert.match(source, /revalidate\s*=\s*300/);
  assert.match(source, /MAX_SITEMAP_URLS\s*=\s*50_000/);
  assert.match(source, /`\$\{SITE_URL\}\/token\/\$\{token\}`/);
  assert.match(source, /`\$\{SITE_URL\}\/creator\/\$\{creator\}`/);
  assert.match(source, /creators\.slice\(0,\s*creatorLimit\)/);
  for (const path of [
    'path: ""',
    'path: "/create"',
    'path: "/security"',
    'path: "/roadmap"',
  ]) {
    assert.match(source, new RegExp(path));
  }
  assert.doesNotMatch(source, /lastModified/);
});

test("builds the token catalog only from bounded official Factory reads", async () => {
  const source = await readFile(
    new URL("./official-token-catalog-server.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /import "server-only"/);
  assert.match(source, /officialFactoryAddresses/);
  assert.match(source, /functionName:\s*"tokenCount"/);
  assert.match(source, /functionName:\s*"allTokens"/);
  assert.match(source, /MAX_SITEMAP_URLS\s*=\s*50_000/);
  assert.match(source, /chunkItems\(slots,\s*TOKEN_READ_BATCH_SIZE\)/);
  assert.match(source, /isAddress\(token\)/);
  assert.match(source, /token\s*!==\s*zeroAddress/);
  assert.match(source, /new Set\(tokens\)/);
  assert.match(source, /revalidate:\s*300/);
  assert.match(source, /catch\s*\{\s*return \[\];/s);
});

test("deduplicates verified creator addresses and keeps sitemap reads resilient", async () => {
  const source = await readFile(
    new URL("./creator-project-server.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /readOfficialCreatorAddresses/);
  assert.match(source, /readOfficialCreatorCatalog\(\)/);
  assert.match(source, /CREATOR_DISCOVERY_TIMEOUT_MS\s*=\s*10_000/);
  assert.match(source, /Promise\.race/);
  assert.match(source, /uniqueCreatorAddresses/);
  assert.match(
    source,
    /catalog\.records\.map\(\(record\) => record\.creator\)/,
  );
  assert.match(source, /catch\s*\{\s*return \[\];/s);
  assert.match(
    source,
    /finally\s*\{\s*if \(timeout\) clearTimeout\(timeout\)/s,
  );
});
