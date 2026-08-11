import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFlapMirrorLoginMessage,
  decodeFlapMirrorSession,
  encodeFlapMirrorSession,
  FlapMirrorRateLimiter,
} from "./flap-mirror-auth-core.ts";

const secret = "s".repeat(32);
const address = "0xbe37ab912de351b9312fa593c9f99e3279fdb0a2";

test("signs a fingerprint-bound Flap operator session and rejects tampering or expiry", () => {
  const payload = { address, exp: 2_000, nonce: "abc123", fp: "fingerprint" };
  const token = encodeFlapMirrorSession(payload, secret);
  assert.deepEqual(decodeFlapMirrorSession(token, secret, 1_999), payload);
  assert.equal(decodeFlapMirrorSession(`${token}x`, secret, 1_999), null);
  assert.equal(decodeFlapMirrorSession(token, secret, 2_001), null);
});

test("builds an exact gasless operator login message", () => {
  const message = buildFlapMirrorLoginMessage({
    address,
    nonce: "abc123",
    expiresAt: 2_000_000,
    origin: "https://preview.example",
  });
  assert.match(message, /BNBX Flap mirror operator access/);
  assert.match(message, new RegExp(`Wallet: ${address}`));
  assert.match(message, /Nonce: abc123/);
  assert.match(message, /Origin: https:\/\/preview\.example/);
  assert.match(message, /does not authorize transactions/);
});

test("rate limits preparation independently by wallet and fingerprint", () => {
  const limiter = new FlapMirrorRateLimiter({ maximum: 2, windowMs: 1_000 });
  assert.equal(limiter.consume(`${address}:fp`, 1_000), true);
  assert.equal(limiter.consume(`${address}:fp`, 1_100), true);
  assert.equal(limiter.consume(`${address}:fp`, 1_200), false);
  assert.equal(limiter.consume(`${address}:other`, 1_200), true);
  assert.equal(limiter.consume(`${address}:fp`, 2_001), true);
});
