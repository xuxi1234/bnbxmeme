import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(
  new URL("./futures-api-server.ts", import.meta.url),
  "utf8",
);
const core = readFileSync(
  new URL("./futures-api-core.ts", import.meta.url),
  "utf8",
);
const securityStore = readFileSync(
  new URL("./futures-security-store.ts", import.meta.url),
  "utf8",
);
const session = readFileSync(
  new URL("../app/api/futures/session/route.ts", import.meta.url),
  "utf8",
);
const resources = readFileSync(
  new URL("../app/api/futures/[resource]/route.ts", import.meta.url),
  "utf8",
);

test("futures API exposes authenticated testnet resources without leaking secrets", () => {
  for (const resource of [
    "market-status",
    "orders",
    "cancellations",
    "fills",
    "positions",
    "collateral-intents",
    "keeper-health",
  ])
    assert.match(core, new RegExp(`\\"${resource}\\"`));
  assert.match(session, /createFuturesChallenge/);
  assert.match(session, /establishFuturesSession/);
  assert.match(resources, /requireFuturesSession/);
  assert.match(resources, /consumeFuturesQuota/);
  assert.match(resources, /forwardFuturesRequest/);
  assert.doesNotMatch(resources, /FUTURES_SERVICE_SECRET/);
  assert.match(server, /Authorization/);
  assert.match(server, /registerFuturesNonce/);
  assert.match(server, /consumeFuturesNonce/);
  assert.match(securityStore, /consume_futures_api_quota/);
  assert.doesNotMatch(server, /new Map/);
  assert.match(server, /readBoundedBody\(\s*request\.body/);
  assert.match(server, /parseFuturesApiResponse/);
  assert.match(resources, /Cache-Control.*no-store/s);
  assert.ok(
    resources.indexOf("await consumeFuturesRequestQuota(request)") <
      resources.indexOf("requireFuturesSession(request)"),
  );
});

test("all API writes pass the explicit Preview-only gate", () => {
  assert.match(server, /requireFuturesWriteEnvironment/);
  assert.match(resources, /POST/);
  assert.match(resources, /DELETE/);
  assert.match(resources, /export const PUT = unsupported/);
  assert.match(session, /export const OPTIONS = unsupported/);
});

test("Preview direct mode dispatches the authenticated wallet without an external URL", () => {
  assert.match(server, /dispatchFuturesRuntime/);
  assert.match(server, /FUTURES_RUNTIME_MODE\s*===\s*"external"/);
  assert.match(server, /wallet:\s*authenticatedWallet/);
  assert.match(resources, /session\.wallet/);
  assert.match(server, /MAX_REQUEST_BYTES\s*=\s*64\s*\*\s*1024/);
  assert.match(server, /MAX_RESPONSE_BYTES\s*=\s*256\s*\*\s*1024/);
  const directBranch = server.indexOf("dispatchFuturesRuntime");
  const externalConfig = server.lastIndexOf("serviceConfiguration()");
  assert.ok(directBranch >= 0 && externalConfig > directBranch);
});
