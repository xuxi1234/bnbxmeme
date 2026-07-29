import "server-only";

import { unstable_cache } from "next/cache";
import { getAddress, isAddress, zeroAddress } from "viem";
import { officialFactoryAddresses } from "@/lib/deployments";
import {
  classifyProjectValidation,
  type FactoryProbe,
  type ProjectValidationResult,
} from "@/lib/project-validation-core";
import { serverPublicClient } from "@/lib/server-chain";

const curveOfAbi = [
  {
    type: "function",
    name: "curveOf",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "curve", type: "address" }],
  },
] as const;

type FactoryMulticallResult =
  | { status: "success"; result: unknown }
  | { status: "failure"; error: unknown };

const inspectProject = unstable_cache(
  async (token: `0x${string}`): Promise<ProjectValidationResult> => {
    let bytecode: `0x${string}` | undefined;
    try {
      bytecode = await serverPublicClient.getBytecode({ address: token });
    } catch {
      return classifyProjectValidation({
        token,
        addressState: "valid",
        bytecodeState: "unavailable",
      });
    }

    if (!bytecode || bytecode === "0x") {
      return classifyProjectValidation({
        token,
        addressState: "valid",
        bytecodeState: "missing",
      });
    }

    let results: FactoryMulticallResult[];
    try {
      results = (await serverPublicClient.multicall({
        allowFailure: true,
        contracts: officialFactoryAddresses.map((factory) => ({
          address: factory,
          abi: curveOfAbi,
          functionName: "curveOf" as const,
          args: [token] as const,
        })),
      })) as FactoryMulticallResult[];
    } catch {
      return classifyProjectValidation({
        token,
        addressState: "valid",
        bytecodeState: "present",
        probes: officialFactoryAddresses.map((factory) => ({
          factory,
          status: "failure" as const,
        })),
      });
    }

    const probes: FactoryProbe[] = officialFactoryAddresses.map(
      (factory, position) => {
        const result = results[position];
        return result?.status === "success" &&
          typeof result.result === "string" &&
          isAddress(result.result)
          ? {
              factory,
              status: "success",
              curve: result.result as `0x${string}`,
            }
          : { factory, status: "failure" };
      },
    );

    return classifyProjectValidation({
      token,
      addressState: "valid",
      bytecodeState: "present",
      probes,
    });
  },
  ["bnbx-token-project-validation-v1"],
  { revalidate: 10 },
);

export async function validateTokenProject(
  rawAddress: string,
): Promise<ProjectValidationResult> {
  const address = rawAddress.trim();
  if (!isAddress(address)) {
    return classifyProjectValidation({
      addressState: "invalid",
      bytecodeState: "missing",
    });
  }

  const token = getAddress(address);
  if (token === zeroAddress) {
    return classifyProjectValidation({
      token,
      addressState: "zero",
      bytecodeState: "missing",
    });
  }

  try {
    return await inspectProject(token);
  } catch {
    return classifyProjectValidation({
      token,
      addressState: "valid",
      bytecodeState: "unavailable",
    });
  }
}
