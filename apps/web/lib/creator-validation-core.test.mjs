import assert from "node:assert/strict";
import test from "node:test";
import { classifyCreatorValidation } from "./creator-validation-core.ts";

const creator = "0x1111111111111111111111111111111111111111";
const otherCreator = "0x2222222222222222222222222222222222222222";
const zero = "0x0000000000000000000000000000000000000000";

test("rejects malformed and zero creator addresses", () => {
  assert.deepEqual(
    classifyCreatorValidation({
      addressState: "invalid",
      catalogState: "complete",
    }),
    { status: "not_found", reason: "invalid-address" },
  );
  assert.deepEqual(
    classifyCreatorValidation({
      address: zero,
      addressState: "zero",
      catalogState: "complete",
    }),
    { status: "not_found", reason: "zero-address" },
  );
});

test("accepts a creator with an official project case-insensitively", () => {
  assert.deepEqual(
    classifyCreatorValidation({
      address: creator,
      addressState: "valid",
      catalogState: "complete",
      creators: [creator.toUpperCase().replace("0X", "0x")],
    }),
    { status: "valid", address: creator },
  );
});

test("rejects an empty creator profile only after a complete catalog read", () => {
  assert.deepEqual(
    classifyCreatorValidation({
      address: creator,
      addressState: "valid",
      catalogState: "complete",
      creators: [otherCreator],
    }),
    { status: "not_found", reason: "no-projects" },
  );
});

test("does not create a false 404 from a partial catalog", () => {
  assert.deepEqual(
    classifyCreatorValidation({
      address: creator,
      addressState: "valid",
      catalogState: "partial",
      creators: [otherCreator],
    }),
    {
      status: "unavailable",
      reason: "catalog-incomplete",
      address: creator,
    },
  );
});

test("does not create a false 404 when the catalog is unavailable", () => {
  assert.deepEqual(
    classifyCreatorValidation({
      address: creator,
      addressState: "valid",
      catalogState: "unavailable",
    }),
    {
      status: "unavailable",
      reason: "catalog-read-failed",
      address: creator,
    },
  );
});
