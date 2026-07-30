import { zeroAddress } from "viem";

export type ProjectAddressState = "valid" | "invalid" | "zero";
export type ProjectBytecodeState = "present" | "missing" | "unavailable";

export type FactoryProbe = {
  factory: `0x${string}`;
  status: "success" | "failure";
  curve?: `0x${string}`;
};

export type ProjectValidationInput = {
  token?: `0x${string}`;
  addressState: ProjectAddressState;
  bytecodeState: ProjectBytecodeState;
  probes?: FactoryProbe[];
};

export type ProjectValidationResult =
  | {
      status: "valid";
      token: `0x${string}`;
      factory: `0x${string}`;
      curve: `0x${string}`;
    }
  | {
      status: "not_found";
      reason: "invalid-address" | "zero-address" | "no-bytecode" | "not-official";
    }
  | {
      status: "unavailable";
      reason: "bytecode-read-failed" | "factory-read-failed";
      token?: `0x${string}`;
    };

export function classifyProjectValidation(
  input: ProjectValidationInput,
): ProjectValidationResult {
  if (input.addressState === "invalid" || !input.token) {
    return { status: "not_found", reason: "invalid-address" };
  }
  if (input.addressState === "zero") {
    return { status: "not_found", reason: "zero-address" };
  }
  if (input.bytecodeState === "missing") {
    return { status: "not_found", reason: "no-bytecode" };
  }
  if (input.bytecodeState === "unavailable") {
    return {
      status: "unavailable",
      reason: "bytecode-read-failed",
      token: input.token,
    };
  }

  const probes = input.probes ?? [];
  const registered = probes.find(
    (probe) =>
      probe.status === "success" &&
      probe.curve !== undefined &&
      probe.curve !== zeroAddress,
  );
  if (registered?.curve) {
    return {
      status: "valid",
      token: input.token,
      factory: registered.factory,
      curve: registered.curve,
    };
  }

  if (
    probes.length === 0 ||
    probes.some(
      (probe) =>
        probe.status === "failure" ||
        (probe.status === "success" && probe.curve === undefined),
    )
  ) {
    return {
      status: "unavailable",
      reason: "factory-read-failed",
      token: input.token,
    };
  }

  return { status: "not_found", reason: "not-official" };
}
