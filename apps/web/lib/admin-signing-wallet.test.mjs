import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ADMIN_SIGNING_WALLET,
  resolveAdminSigningWallet,
} from "./admin-signing-wallet.ts";

const revenueWallet = "0xDAF4f62914f7F64c9eabFd473F4dB4b7e74048A6";

test("uses the dedicated admin signing wallet by default", () => {
  assert.equal(
    resolveAdminSigningWallet(),
    DEFAULT_ADMIN_SIGNING_WALLET.toLowerCase(),
  );
  assert.equal(
    resolveAdminSigningWallet("  "),
    DEFAULT_ADMIN_SIGNING_WALLET.toLowerCase(),
  );
  assert.equal(
    resolveAdminSigningWallet("not-an-address"),
    DEFAULT_ADMIN_SIGNING_WALLET.toLowerCase(),
  );
});

test("never inherits the platform revenue wallet as an admin", () => {
  assert.equal(
    resolveAdminSigningWallet(revenueWallet),
    DEFAULT_ADMIN_SIGNING_WALLET.toLowerCase(),
  );
});

test("accepts one explicitly configured admin signing wallet", () => {
  const configured = "0x1111111111111111111111111111111111111111";
  assert.equal(resolveAdminSigningWallet(` ${configured} `), configured);
});
