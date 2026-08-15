import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260815090000_futures_api_security.sql",
    import.meta.url,
  ),
  "utf8",
);
const adapter = readFileSync(
  new URL("./futures-security-store.ts", import.meta.url),
  "utf8",
);

test("shared quota uses a row lock, fixed window TTL and atomic increment", () => {
  assert.match(migration, /consume_futures_api_quota[\s\S]*for update/i);
  assert.match(migration, /on conflict \(quota_key\) do nothing/i);
  assert.match(migration, /request_count >= p_maximum[\s\S]*return false/i);
  assert.match(migration, /request_count = request_count \+ 1/i);
  assert.match(
    migration,
    /window_started_at <= cutoff[\s\S]*request_count = 1/i,
  );
  assert.match(migration, /limit 100/i);
  assert.doesNotMatch(adapter, /new Map/);
});

test("nonce registration is unique and consumption is one-time, locked and expiring", () => {
  assert.match(migration, /nonce_hash text primary key/i);
  assert.match(
    migration,
    /register_futures_api_nonce[\s\S]*on conflict \(nonce_hash\) do nothing/i,
  );
  assert.match(migration, /consume_futures_api_nonce[\s\S]*for update/i);
  assert.match(migration, /expires_at <= clock_timestamp\(\)/i);
  assert.match(migration, /consumed_at is not null[\s\S]*return false/i);
  assert.match(
    migration,
    /set consumed_at = clock_timestamp\(\)[\s\S]*consumed_at is null/i,
  );
});

test("security tables and RPCs are service-role-only and adapter hashes all identities", () => {
  assert.match(
    migration,
    /revoke all on public\.futures_api_quotas from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /revoke all on public\.futures_api_nonces from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.consume_futures_api_quota[\s\S]*to service_role/i,
  );
  assert.match(adapter, /createHmac\("sha256"/);
  assert.match(adapter, /SUPABASE_SECRET_KEY/);
  assert.match(adapter, /redirect: "error"/);
  assert.doesNotMatch(adapter, /NEXT_PUBLIC.*SECRET/);
  assert.ok(adapter.includes('import "server-only"'));
});
