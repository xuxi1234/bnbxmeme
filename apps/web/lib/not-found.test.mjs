import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const MARKET_HREF = "/?market=hot#market";

test("renders a localized global 404 with an explicit market destination", async () => {
  const source = await readFile(
    new URL("../app/not-found.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /t\("pageNotFoundTitle"\)/);
  assert.match(source, /t\("pageNotFoundHelp"\)/);
  assert.match(source, /t\("returnMarket"\)/);
  assert.match(source, new RegExp(`href="${MARKET_HREF.replace("?", "\\?")}"`));
  assert.match(source, /role="alert"/);
  assert.match(source, /aria-labelledby="page-not-found-title"/);
});

test("routes invalid token projects back to the market section", async () => {
  const [boundary, source] = await Promise.all([
    readFile(
      new URL("../app/token/[address]/not-found.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/token/[address]/project-state.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(boundary, /<ProjectState state="not-found" \/>/);
  assert.match(source, new RegExp(`href="${MARKET_HREF.replace("?", "\\?")}"`));
  assert.doesNotMatch(source, /<Link href="\/">/);
});
