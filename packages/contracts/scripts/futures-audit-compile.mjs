import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertCompileProof, stableJson } from "./futures-tooling.mjs";

const root = resolve(import.meta.dirname, "..");
const proofPath = resolve(root, process.env.FUTURES_COMPILE_PROOF ?? ".futures-compile/futures.compile-proof.json");
const recorded = JSON.parse(readFileSync(proofPath, "utf8"));
assertCompileProof(recorded);
const temp = mkdtempSync(join(tmpdir(), "bnbx-futures-compile-audit-"));
const freshPath = join(temp, "fresh.compile-proof.json");
try {
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, "futures-compile.mjs")], { cwd: root, env: { ...process.env, FUTURES_COMPILE_PROOF: freshPath }, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "independent compile failed");
  const fresh = JSON.parse(readFileSync(freshPath, "utf8"));
  assertCompileProof(fresh);
  if (stableJson(recorded) !== stableJson(fresh)) throw new Error("compile proof does not match an independent compilation");
  console.log(`PASS futures compile proof ${recorded.contracts.length} contracts`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
