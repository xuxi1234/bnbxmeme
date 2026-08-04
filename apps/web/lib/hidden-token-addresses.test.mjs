import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  hiddenTokenAddresses,
  isHiddenTokenAddress,
} from "./hidden-token-addresses.ts";

test("retires exactly the six requested test launches by address", () => {
  assert.equal(hiddenTokenAddresses.length, 6);
  assert.equal(new Set(hiddenTokenAddresses).size, 6);
  for (const address of hiddenTokenAddresses) {
    assert.match(address, /^0x[0-9a-f]{40}$/);
    assert.equal(isHiddenTokenAddress(address.toUpperCase()), true);
  }
});

test("does not retire the separate 0-tax test launch outside the request", () => {
  assert.equal(
    isHiddenTokenAddress("0x01E986b3Fa4798d34932F67cA37997a312671111"),
    false,
  );
});

test("applies retirement to market, detail, creator, and crawler catalogs", async () => {
  const sources = await Promise.all(
    [
      "../app/api/market-data/route.ts",
      "./token-project-server.ts",
      "./creator-project-server.ts",
      "./official-token-catalog-server.ts",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  for (const source of sources) {
    assert.match(source, /isHiddenTokenAddress/);
  }
});
