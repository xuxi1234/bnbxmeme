import assert from "node:assert/strict";
import test from "node:test";
import { pinFeaturedExternalEntry } from "./featured-market-core.ts";

const featured = {
  token: "0xfd87628840890c9ea4eb3a0053a691b29d3e1111",
  name: "BNBX",
  symbol: "BNBX",
};
const ordinary = [
  {
    token: "0x1111111111111111111111111111111111111111",
    name: "Alpha",
    symbol: "ALP",
  },
  {
    token: "0x2222222222222222222222222222222222222222",
    name: "Beta",
    symbol: "BET",
  },
];

test("pins BNBX first in both external market filters without reordering projects", () => {
  for (const filter of ["newExternal", "hotExternal"]) {
    assert.deepEqual(
      pinFeaturedExternalEntry(filter, "", ordinary, featured).map(
        (entry) => entry.token,
      ),
      [featured.token, ordinary[0].token, ordinary[1].token],
    );
  }
});

test("does not add BNBX to internal market filters", () => {
  for (const filter of ["hotInternal", "newInternal", "graduating"]) {
    assert.deepEqual(
      pinFeaturedExternalEntry(filter, "", ordinary, featured),
      ordinary,
    );
  }
});

test("respects search and supports name, symbol, and contract matches", () => {
  for (const query of ["bnbx", "BNBX", "fd876288"])
    assert.equal(
      pinFeaturedExternalEntry("newExternal", query, [], featured)[0],
      featured,
    );
  assert.deepEqual(
    pinFeaturedExternalEntry("newExternal", "alpha", ordinary, featured),
    ordinary,
  );
});

test("moves an existing BNBX entry to first place without duplicating it", () => {
  const result = pinFeaturedExternalEntry(
    "hotExternal",
    "",
    [...ordinary, featured],
    featured,
  );
  assert.equal(result[0], featured);
  assert.equal(
    result.filter((entry) => entry.token.toLowerCase() === featured.token)
      .length,
    1,
  );
});
