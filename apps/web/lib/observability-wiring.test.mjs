import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("wires Vercel analytics and real-user speed insights into every page", async () => {
  const [layout, packageJson] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  const dependencies = JSON.parse(packageJson).dependencies;

  assert.equal(typeof dependencies["@vercel/analytics"], "string");
  assert.equal(typeof dependencies["@vercel/speed-insights"], "string");
  assert.match(
    layout,
    /import \{ Analytics \} from "@vercel\/analytics\/next"/,
  );
  assert.match(
    layout,
    /import \{ SpeedInsights \} from "@vercel\/speed-insights\/next"/,
  );
  assert.match(layout, /<Analytics \/>/);
  assert.match(layout, /<SpeedInsights \/>/);
});
