import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const atomicMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260730013952_atomic_comment_submission.sql",
    import.meta.url,
  ),
  "utf8",
);
const contractWalletMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260730014028_support_contract_wallet_signatures.sql",
    import.meta.url,
  ),
  "utf8",
);
const reportMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260730111240_add_comment_reports.sql",
    import.meta.url,
  ),
  "utf8",
);
const walletBanMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260730111622_add_comment_wallet_bans.sql",
    import.meta.url,
  ),
  "utf8",
);

test("enforces comment limits on both legacy inserts and the new RPC", () => {
  assert.match(atomicMigration, /before insert on public\.token_comments/i);
  assert.match(atomicMigration, /COMMENT_RATE_LIMIT/);
  assert.match(atomicMigration, /COMMENT_SIGNATURE_REPLAY/);
  assert.match(atomicMigration, /function public\.submit_token_comment/i);
  assert.doesNotMatch(
    atomicMigration,
    /revoke\s+insert\s+on\s+(table\s+)?public\.token_comments/i,
  );
});

test("supports long contract-wallet signatures without long B-tree keys", () => {
  assert.match(
    contractWalletMigration,
    /drop constraint if exists token_comments_signature_key/i,
  );
  assert.match(
    contractWalletMigration,
    /token_comments_signature_hash_idx[\s\S]*md5\(lower\(signature\)\)/i,
  );
  assert.match(contractWalletMigration, /char_length\(new\.signature\)/i);
  assert.match(contractWalletMigration, /lower\(signature\) = new\.signature/i);
});

test("stores signed comment reports behind server-only RLS", () => {
  assert.match(
    reportMigration,
    /create table if not exists public\.comment_reports/i,
  );
  assert.match(
    reportMigration,
    /unique\s*\(\s*comment_id,\s*reporter_wallet\s*\)/i,
  );
  assert.match(
    reportMigration,
    /alter table public\.comment_reports enable row level security/i,
  );
  assert.match(
    reportMigration,
    /revoke all on table public\.comment_reports from anon, authenticated/i,
  );
  assert.match(
    reportMigration,
    /references public\.token_comments\s*\(id\)[\s\S]*on delete cascade/i,
  );
});

test("enforces active wallet bans inside the atomic comment trigger", () => {
  assert.match(
    walletBanMigration,
    /create table if not exists public\.comment_wallet_bans/i,
  );
  assert.match(
    walletBanMigration,
    /from public\.comment_wallet_bans[\s\S]*active = true[\s\S]*COMMENT_WALLET_BANNED/i,
  );
  assert.match(
    walletBanMigration,
    /alter table public\.comment_wallet_bans enable row level security/i,
  );
  assert.match(
    walletBanMigration,
    /revoke all on table public\.comment_wallet_bans from anon, authenticated/i,
  );
  assert.match(walletBanMigration, /'ban_wallet'/i);
  assert.match(walletBanMigration, /'unban_wallet'/i);
});
