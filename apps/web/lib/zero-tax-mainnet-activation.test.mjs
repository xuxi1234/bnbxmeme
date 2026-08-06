import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  officialFactoryAddresses,
  standardFactoryAddress,
  supersededZeroTaxFactoryAddress,
  v4StandardFactoryAddress,
  zeroTaxFactoryAddress,
} from "./deployments.ts";

test("activates only the clean zero-tax Factory for new standard launches", () => {
  assert.equal(
    zeroTaxFactoryAddress,
    "0x26f43d62e1cfadc3d89ff0ffe58375ecbded7330",
  );
  assert.equal(standardFactoryAddress, zeroTaxFactoryAddress);
  assert.ok(officialFactoryAddresses.includes(zeroTaxFactoryAddress));
  assert.ok(!officialFactoryAddresses.includes(supersededZeroTaxFactoryAddress));
  assert.ok(!officialFactoryAddresses.includes(v4StandardFactoryAddress));
});

test("wires the clean Factory through creation and immediate verification", async () => {
  const [createPage, web3, verifier] = await Promise.all([
    readFile(new URL("../app/create/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("./web3.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/verify-launch/route.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(createPage, /v3StandardFactoryAddress/);
  for (const functionName of [
    "findVanitySalt",
    "createVanityToken",
    "createVanityTokenAndBuy",
    "buy",
    "sell",
  ]) {
    assert.match(web3, new RegExp(`name: "${functionName}"`));
  }
  assert.match(verifier, /zeroTaxFactoryDeploymentAbi/);
  assert.match(verifier, /verify-zero-tax-mainnet\.yml/);
});
