import assert from "node:assert/strict";
import test from "node:test";
import {
  findBlockedTerm,
  normalizeModerationText,
} from "./comment-moderation-core.ts";

test("normalizes ordinary spacing, punctuation, width, and case variants", () => {
  assert.equal(normalizeModerationText("Ｓ.C_A M"), "scam");
  assert.equal(findBlockedTerm("This is S-C_A M", ["scam"]), "scam");
});

test("blocks invisible Unicode format-character bypasses", () => {
  for (const body of [
    "s\u200Bcam",
    "s\u200Ccam",
    "s\u200Dcam",
    "s\u2060cam",
    "s\u00ADcam",
    "s\u2066cam\u2069",
  ]) {
    assert.equal(findBlockedTerm(body, ["scam"]), "scam", body);
  }
});

test("blocks combining-mark and accent variants", () => {
  for (const body of ["s\u0338cam", "s\u0301cam", "scám"]) {
    assert.equal(findBlockedTerm(body, ["scam"]), "scam", body);
  }
});

test("ignores empty normalized terms without blocking unrelated comments", () => {
  assert.equal(
    findBlockedTerm("legitimate project discussion", ["\u200B"]),
    null,
  );
  assert.equal(
    findBlockedTerm("legitimate project discussion", ["scam"]),
    null,
  );
});
