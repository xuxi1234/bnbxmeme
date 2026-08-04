import "server-only";

import { unstable_cache } from "next/cache";
import { isAddress, zeroAddress } from "viem";
import { officialFactoryAddresses } from "@/lib/deployments";
import { buildFactorySlots, chunkItems } from "@/lib/market-data-core";
import { serverPublicClient } from "@/lib/server-chain";
import { isHiddenTokenAddress } from "@/lib/hidden-token-addresses";

const TOKEN_READ_BATCH_SIZE = 100;
const MAX_SITEMAP_URLS = 50_000;
const PUBLIC_SITEMAP_URLS = 4;
const MAX_TOKEN_URLS = MAX_SITEMAP_URLS - PUBLIC_SITEMAP_URLS;

const factoryCatalogAbi = [
  {
    type: "function",
    name: "tokenCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allTokens",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [{ name: "token", type: "address" }],
  },
] as const;

type MulticallResult =
  | { status: "success"; result: unknown }
  | { status: "failure"; error: unknown };

function successful<T>(result: MulticallResult | undefined) {
  return result?.status === "success" ? (result.result as T) : undefined;
}

async function inspectOfficialTokenCatalog() {
  const countResults = (await serverPublicClient.multicall({
    allowFailure: true,
    contracts: officialFactoryAddresses.map((address) => ({
      address,
      abi: factoryCatalogAbi,
      functionName: "tokenCount" as const,
    })),
  })) as MulticallResult[];

  const availableFactories = officialFactoryAddresses.flatMap(
    (factory, position) => {
      const count = successful<bigint>(countResults[position]);
      return count === undefined ? [] : [{ factory, count }];
    },
  );
  if (availableFactories.length === 0) {
    throw new Error("All official Factory catalog reads failed");
  }

  const maxPerFactory = Math.max(
    1,
    Math.floor(MAX_TOKEN_URLS / availableFactories.length),
  );
  const slots = buildFactorySlots(availableFactories, maxPerFactory);
  const tokens: string[] = [];

  for (const batch of chunkItems(slots, TOKEN_READ_BATCH_SIZE)) {
    const results = (await serverPublicClient.multicall({
      allowFailure: true,
      contracts: batch.map(({ factory, index }) => ({
        address: factory,
        abi: factoryCatalogAbi,
        functionName: "allTokens" as const,
        args: [index] as const,
      })),
    })) as MulticallResult[];

    for (const result of results) {
      const token = successful<string>(result);
      if (
        token &&
        isAddress(token) &&
        token !== zeroAddress &&
        !isHiddenTokenAddress(token)
      ) {
        tokens.push(token.toLowerCase());
      }
    }
  }

  return [...new Set(tokens)].slice(0, MAX_TOKEN_URLS);
}

const readCachedOfficialTokenCatalog = unstable_cache(
  inspectOfficialTokenCatalog,
  ["bnbx-official-token-catalog-v1"],
  { revalidate: 300 },
);

export async function readOfficialTokenCatalog() {
  try {
    return await readCachedOfficialTokenCatalog();
  } catch {
    return [];
  }
}
