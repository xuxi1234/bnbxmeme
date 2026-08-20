import assert from "node:assert/strict";
import test from "node:test";
import { runtimeFailureDiagnostic } from "./futures-runtime-diagnostic.ts";

test("runtime diagnostics expose only an error name and nested revert selector", () => {
  const secret = `0x${"ab".repeat(65)}`;
  const error = new Error(`RPC rejected signed calldata ${secret}`);
  error.cause = {
    data: { data: "0x11223344deadbeef" },
    requestBody: secret,
  };

  const diagnostic = runtimeFailureDiagnostic(error);

  assert.deepEqual(diagnostic, {
    name: "Error",
    revertSelector: "0x11223344",
  });
  assert.equal(JSON.stringify(diagnostic).includes(secret), false);
});
