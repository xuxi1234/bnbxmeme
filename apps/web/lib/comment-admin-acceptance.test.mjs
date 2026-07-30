import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildCommentAdminLoginMessage } from "./comment-admin-message.ts";

const adminWallet = "0x1111111111111111111111111111111111111111";
const signedAt = "2026-07-30T12:00:00.000Z";

test("binds admin authorization to the wallet, BSC, and issue time", () => {
  assert.equal(
    buildCommentAdminLoginMessage({ wallet: adminWallet, signedAt }),
    [
      "BNBX Comment Moderation",
      "",
      "Authorize this wallet to manage BNBX project discussions.",
      "This signature does not send a transaction or spend gas.",
      "",
      `Wallet: ${adminWallet}`,
      "Chain ID: 56",
      `Issued At: ${signedAt}`,
    ].join("\n"),
  );
});

test("keeps the production admin allowlist and signature checks server-side", async () => {
  const source = await readFile(
    new URL("./comment-admin-server.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /import "server-only"/);
  assert.match(source, /process\.env\.BNBX_COMMENT_ADMIN_WALLETS/);
  assert.match(source, /officialFactoryAddresses/);
  assert.match(source, /functionName:\s*"feeRecipient"/);
  assert.match(source, /isSupportedWalletSignature/);
  assert.match(source, /verifyWalletMessage/);
  assert.match(source, /LOGIN_WINDOW_MS\s*=\s*10\s*\*\s*60_000/);
  assert.match(source, /SESSION_LIFETIME_MS\s*=\s*2\s*\*\s*60\s*\*\s*60_000/);
});

test("requires an authenticated session before reads, exports, and mutations", async () => {
  const source = await readFile(
    new URL("../app/api/admin/comments/route.ts", import.meta.url),
    "utf8",
  );
  const getHandler = source.slice(
    source.indexOf("export async function GET"),
    source.indexOf("export async function POST"),
  );
  assert.ok(
    getHandler.indexOf("readCommentAdminSession(request)") <
      getHandler.indexOf('searchParams.get("export")'),
  );

  const postHandler = source.slice(
    source.indexOf("export async function POST"),
  );
  const authenticatedActions = postHandler.slice(
    postHandler.indexOf("const adminWallet = await readCommentAdminSession"),
  );
  for (const action of [
    "logout",
    "set_enabled",
    "set_blocked_terms",
    "set_wallet_ban",
    "set_hidden",
    "delete",
  ]) {
    assert.match(
      authenticatedActions,
      new RegExp(`input\\.action === "${action}"`),
    );
  }
  assert.match(source, /httpOnly:\s*true/);
  assert.match(source, /sameSite:\s*"strict"/);
  assert.match(source, /secure:\s*process\.env\.NODE_ENV === "production"/);
});

test("uses the connected wallet to sign the exact server-verified message", async () => {
  const source = await readFile(
    new URL("../app/admin/moderation/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /buildCommentAdminLoginMessage\(\{/);
  assert.match(source, /wallet:\s*address/);
  assert.match(
    source,
    /const signature = await signMessageAsync\(\{ message \}\)/,
  );
  assert.match(source, /action:\s*"authenticate"/);
});
