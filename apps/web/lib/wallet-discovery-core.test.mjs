import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseWeb3WalletAction,
  discoverWeb3Connectors,
} from "./wallet-discovery-core.ts";

const connector = (id, name, provider = {}) => ({
  id,
  name,
  type: "injected",
  getProvider: async () => provider,
});

test("discovers injected wallets with an available provider", async () => {
  const available = connector("io.ave", "AVE Wallet");
  const unavailable = connector("missing", "Missing Wallet", undefined);
  unavailable.getProvider = async () => undefined;

  assert.deepEqual(await discoverWeb3Connectors([available, unavailable]), [available]);
});

test("deduplicates the generic injected connector when a named wallet uses the same provider", async () => {
  const provider = {};
  const generic = connector("injected", "Injected", provider);
  const ave = connector("io.ave", "AVE Wallet", provider);

  assert.deepEqual(await discoverWeb3Connectors([generic, ave]), [ave]);
});

test("keeps different injected providers available for selection", async () => {
  const ave = connector("io.ave", "AVE Wallet");
  const okx = connector("com.okex.wallet", "OKX Wallet");

  assert.deepEqual(await discoverWeb3Connectors([ave, okx]), [ave, okx]);
});

test("chooses the correct UI action for zero, one, or many wallets", () => {
  assert.equal(chooseWeb3WalletAction([]), "guide");
  assert.equal(chooseWeb3WalletAction([{}]), "connect");
  assert.equal(chooseWeb3WalletAction([{}, {}]), "select");
});
