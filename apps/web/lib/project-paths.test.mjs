import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  creatorProjectPath,
  isCanonicalProjectAddress,
  tokenProjectPath,
} from "./project-paths.ts";

const checksumAddress = "0xbE37AB912De351B9312FA593C9f99e3279FDB0a2";
const lowercaseAddress = checksumAddress.toLowerCase();

test("builds one lowercase URL for token and creator projects", () => {
  assert.equal(tokenProjectPath(checksumAddress), `/token/${lowercaseAddress}`);
  assert.equal(
    creatorProjectPath(checksumAddress),
    `/creator/${lowercaseAddress}`,
  );
});

test("redirects non-canonical address casing without changing identity", () => {
  assert.equal(
    isCanonicalProjectAddress(lowercaseAddress, checksumAddress),
    true,
  );
  assert.equal(
    isCanonicalProjectAddress(checksumAddress, checksumAddress),
    false,
  );
});

test("wires permanent redirects and lowercase internal project links", async () => {
  const [tokenRoute, creatorRoute, market, create, moderation, tokenTrading] =
    await Promise.all([
      readFile(
        new URL("../app/token/[address]/page.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/creator/[address]/page.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../components/token-market.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/create/page.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/admin/moderation/page.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/token/[address]/token-trading-page.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);

  for (const route of [tokenRoute, creatorRoute]) {
    assert.match(route, /permanentRedirect/);
    assert.match(route, /isCanonicalProjectAddress/);
  }
  assert.match(tokenRoute, /tokenProjectPath/);
  assert.match(creatorRoute, /creatorProjectPath/);
  assert.match(market, /tokenProjectPath\(entry\.token\)/);
  assert.match(create, /tokenProjectPath\(args\.token\)/);
  assert.match(moderation, /tokenProjectPath\(comment\.token\)/);
  assert.match(tokenTrading, /creatorProjectPath\(creatorAddress\)/);
});
