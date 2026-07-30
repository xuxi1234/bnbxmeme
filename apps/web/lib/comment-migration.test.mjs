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
  assert.match(
    contractWalletMigration,
    /lower\(signature\) = new\.signature/i,
  );
});
