import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = new URL(
  "../../../supabase/migrations/20260817120000_futures_matching_runtime.sql",
  import.meta.url,
);

test("runtime migration is RLS locked and exposes bounded CAS and lease RPCs", () => {
  const sql = readFileSync(migration, "utf8");
  for (const table of [
    "futures_matching_states",
    "futures_effect_leases",
    "futures_fill_index",
  ]) {
    assert.match(
      sql,
      new RegExp(
        `alter table public\\.${table} enable row level security`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `revoke all on public\\.${table} from public, anon, authenticated`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `${table}_deny_direct_access[\\s\\S]+as restrictive for all to public[\\s\\S]+using \\(false\\) with check \\(false\\)`,
        "i",
      ),
    );
  }
  assert.match(
    sql,
    /where deployment_key = p_deployment_key\s+and revision = p_expected_revision/i,
  );
  assert.match(sql, /p_lease_seconds < 1 or p_lease_seconds > 60/i);
  assert.match(sql, /on conflict \(chain_id, order_book, tx_hash, log_index\)/i);
  assert.match(sql, /grant execute[\s\S]+to service_role/i);
  assert.equal((sql.match(/set search_path = ''/gi) ?? []).length, 6);
  assert.equal((sql.match(/security invoker/gi) ?? []).length, 6);
  assert.doesNotMatch(sql, /security definer/i);
  assert.doesNotMatch(sql, /grant .+ to (?:anon|authenticated)/i);
});

test("runtime state and fill inputs are size and identity bounded", () => {
  const sql = readFileSync(migration, "utf8");
  assert.match(sql, /octet_length\(p_serialized::text\) > 2097152/i);
  assert.match(sql, /p_chain_id <> 97/i);
  assert.match(sql, /p_order_book !~ '\^0x\[0-9a-f\]\{40\}\$'/i);
  assert.match(sql, /p_tx_hash !~ '\^0x\[0-9a-f\]\{64\}\$'/i);
  assert.match(sql, /p_limit < 1 or p_limit > 100/i);
});
