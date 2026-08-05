import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [route, component, copy] = await Promise.all([
  readFile(
    new URL("../app/api/bnbx-ai/chat/route.ts", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../components/bnbx-ai-assistant.tsx", import.meta.url),
    "utf8",
  ),
  readFile(new URL("bnbx-ai-copy.ts", import.meta.url), "utf8"),
]);

test("classifies provider failures without exposing keys or prompts", () => {
  for (const code of [
    "provider_auth",
    "provider_quota",
    "provider_rate_limit",
    "provider_access",
    "provider_unavailable",
  ]) {
    assert.match(route, new RegExp(code));
  }
  assert.match(route, /BNBX_AI_PROVIDER_ERROR/);
  assert.doesNotMatch(route, /console\.error\([^)]*apiKey/);
  assert.doesNotMatch(route, /console\.error\([^)]*messages/);
});

test("retries only transient provider failures and enforces a timeout", () => {
  assert.match(route, /PROVIDER_TIMEOUT_MS = 45_000/);
  assert.match(route, /AbortController/);
  assert.match(route, /attempt < 2/);
  assert.match(route, /providerStatus >= 500/);
  assert.doesNotMatch(
    route,
    /error\.code === "provider_quota"[\s\S]{0,80}return true/,
  );
});

test("shows localized actionable errors instead of one generic failure", () => {
  for (const key of [
    "sessionExpired",
    "providerQuota",
    "providerRateLimit",
    "providerUnavailable",
  ]) {
    assert.match(copy, new RegExp(`${key}: string`));
    assert.match(component, new RegExp(`copy\\.${key}`));
  }
  assert.match(component, /result\.code/);
  assert.match(component, /readChatErrorCode\(result\)/);
  assert.match(route, /BNBX_AI_PROVIDER_EMPTY_RESPONSE/);
  assert.match(route, /provider_empty_response/);
});
