import "server-only";

import { unstable_cache } from "next/cache";
import { serverPublicClient } from "@/lib/server-chain";

const tokenIdentityAbi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

const inspectTokenIdentity = unstable_cache(
  async (token: `0x${string}`) => {
    const results = await serverPublicClient.multicall({
      allowFailure: true,
      contracts: [
        {
          address: token,
          abi: tokenIdentityAbi,
          functionName: "name",
        },
        {
          address: token,
          abi: tokenIdentityAbi,
          functionName: "symbol",
        },
      ],
    });

    const name =
      results[0]?.status === "success" && typeof results[0].result === "string"
        ? results[0].result
        : null;
    const symbol =
      results[1]?.status === "success" && typeof results[1].result === "string"
        ? results[1].result
        : null;

    return { name, symbol };
  },
  ["bnbx-token-identity-v1"],
  { revalidate: 300 },
);

export async function readTokenIdentity(token: `0x${string}`) {
  try {
    return await inspectTokenIdentity(token);
  } catch {
    return null;
  }
}
