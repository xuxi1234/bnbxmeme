import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyProjectValidation,
} from "./project-validation-core.ts";

const token = "0x1111111111111111111111111111111111111111";
const factories = [
  "0x2222222222222222222222222222222222222222",
  "0x3333333333333333333333333333333333333333",
  "0x4444444444444444444444444444444444444444",
];
const curve = "0x5555555555555555555555555555555555555555";
const zero = "0x0000000000000000000000000000000000000000";

function successProbes(...curves) {
  return factories.map((factory, position) => ({
    factory,
    status: "success",
    curve: curves[position] ?? zero,
  }));
}

test("rejects malformed and zero addresses as not found", () => {
  assert.deepEqual(
    classifyProjectValidation({
      addressState: "invalid",
      bytecodeState: "missing",
    }),
    { status: "not_found", reason: "invalid-address" },
  );
  assert.deepEqual(
    classifyProjectValidation({
      token: zero,
      addressState: "zero",
      bytecodeState: "missing",
    }),
    { status: "not_found", reason: "zero-address" },
  );
});

test("rejects EOAs and missing contracts as not found", () => {
  assert.deepEqual(
    classifyProjectValidation({
      token,
      addressState: "valid",
      bytecodeState: "missing",
    }),
    { status: "not_found", reason: "no-bytecode" },
  );
});

test("returns unavailable when bytecode cannot be read", () => {
  assert.deepEqual(
    classifyProjectValidation({
      token,
      addressState: "valid",
      bytecodeState: "unavailable",
    }),
    { status: "unavailable", reason: "bytecode-read-failed", token },
  );
});

test("accepts a token registered by any official Factory", () => {
  assert.deepEqual(
    classifyProjectValidation({
      token,
      addressState: "valid",
      bytecodeState: "present",
      probes: successProbes(zero, curve, zero),
    }),
    {
      status: "valid",
      token,
      factory: factories[1],
      curve,
    },
  );
});

test("accepts a confirmed registration even when another Factory fails", () => {
  assert.deepEqual(
    classifyProjectValidation({
      token,
      addressState: "valid",
      bytecodeState: "present",
      probes: [
        { factory: factories[0], status: "failure" },
        { factory: factories[1], status: "success", curve },
        { factory: factories[2], status: "success", curve: zero },
      ],
    }),
    {
      status: "valid",
      token,
      factory: factories[1],
      curve,
    },
  );
});

test("rejects another platform contract only after every Factory returns zero", () => {
  assert.deepEqual(
    classifyProjectValidation({
      token,
      addressState: "valid",
      bytecodeState: "present",
      probes: successProbes(zero, zero, zero),
    }),
    { status: "not_found", reason: "not-official" },
  );
});

test("does not create a false 404 when any Factory probe fails", () => {
  assert.deepEqual(
    classifyProjectValidation({
      token,
      addressState: "valid",
      bytecodeState: "present",
      probes: [
        { factory: factories[0], status: "success", curve: zero },
        { factory: factories[1], status: "failure" },
        { factory: factories[2], status: "success", curve: zero },
      ],
    }),
    { status: "unavailable", reason: "factory-read-failed", token },
  );
});

test("does not create a false 404 from a malformed successful probe", () => {
  assert.deepEqual(
    classifyProjectValidation({
      token,
      addressState: "valid",
      bytecodeState: "present",
      probes: [
        { factory: factories[0], status: "success", curve: zero },
        { factory: factories[1], status: "success" },
        { factory: factories[2], status: "success", curve: zero },
      ],
    }),
    { status: "unavailable", reason: "factory-read-failed", token },
  );
});

test("returns unavailable when every Factory probe fails", () => {
  assert.deepEqual(
    classifyProjectValidation({
      token,
      addressState: "valid",
      bytecodeState: "present",
      probes: factories.map((factory) => ({ factory, status: "failure" })),
    }),
    { status: "unavailable", reason: "factory-read-failed", token },
  );
});
