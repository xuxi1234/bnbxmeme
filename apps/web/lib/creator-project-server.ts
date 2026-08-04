import "server-only";

import { getAddress, isAddress, zeroAddress } from "viem";
import {
  classifyCreatorValidation,
  type CreatorValidationResult,
  uniqueCreatorAddresses,
} from "@/lib/creator-validation-core";
import { officialFactoryAddresses } from "@/lib/deployments";
import { buildFactorySlots, chunkItems } from "@/lib/market-data-core";
import { serverPublicClient } from "@/lib/server-chain";
import { isHiddenTokenAddress } from "@/lib/hidden-token-addresses";

const TOKEN_READ_BATCH_SIZE = 100;
const CREATOR_CATALOG_CACHE_MS = 60_000;
const PARTIAL_CREATOR_CATALOG_CACHE_MS = 10_000;
const CREATOR_DISCOVERY_TIMEOUT_MS = 10_000;

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
  {
    type: "function",
    name: "curveOf",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "curve", type: "address" }],
  },
] as const;

const curveCreatorAbi = [
  {
    type: "function",
    name: "creator",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

type MulticallResult =
  | { status: "success"; result: unknown }
  | { status: "failure"; error: unknown };

type FactorySlot = {
  factory: `0x${string}`;
  index: bigint;
  creationIndex: number;
};

type TokenRecord = FactorySlot & {
  token: `0x${string}`;
};

type CurveRecord = TokenRecord & {
  curve: `0x${string}` | null;
};

export type CreatorRecord = TokenRecord & {
  curve: `0x${string}`;
  creator: `0x${string}`;
};

export type CreatorCatalog = {
  records: CreatorRecord[];
  partial: boolean;
};

let creatorCatalogCache:
  | (CreatorCatalog & {
      expiresAt: number;
    })
  | undefined;
let creatorCatalogRequest: Promise<CreatorCatalog> | undefined;

function successful<T>(result: MulticallResult | undefined) {
  return result?.status === "success" ? (result.result as T) : undefined;
}

async function readFactoryCounts() {
  const results = (await serverPublicClient.multicall({
    allowFailure: true,
    contracts: officialFactoryAddresses.map((address) => ({
      address,
      abi: factoryCatalogAbi,
      functionName: "tokenCount" as const,
    })),
  })) as MulticallResult[];
  const availableFactories = officialFactoryAddresses.flatMap(
    (factory, position) => {
      const count = successful<bigint>(results[position]);
      return count === undefined ? [] : [{ factory, count }];
    },
  );

  if (availableFactories.length === 0) {
    throw new Error("All official Factory creator catalog reads failed");
  }

  return {
    availableFactories,
    partial: availableFactories.length !== officialFactoryAddresses.length,
  };
}

async function readTokenRecords(slots: FactorySlot[]) {
  const records: TokenRecord[] = [];
  let partial = false;

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

    batch.forEach((slot, position) => {
      const token = successful<string>(results[position]);
      if (token && isAddress(token) && token !== zeroAddress) {
        if (!isHiddenTokenAddress(token)) {
          records.push({ ...slot, token: getAddress(token) });
        }
      } else {
        partial = true;
      }
    });
  }

  return { records, partial };
}

async function readCurveRecords(records: TokenRecord[]) {
  const curveRecords: CurveRecord[] = [];
  let partial = false;

  for (const batch of chunkItems(records, TOKEN_READ_BATCH_SIZE)) {
    const results = (await serverPublicClient.multicall({
      allowFailure: true,
      contracts: batch.map(({ factory, token }) => ({
        address: factory,
        abi: factoryCatalogAbi,
        functionName: "curveOf" as const,
        args: [token] as const,
      })),
    })) as MulticallResult[];

    batch.forEach((record, position) => {
      const curve = successful<string>(results[position]);
      if (curve && isAddress(curve) && curve !== zeroAddress) {
        curveRecords.push({ ...record, curve: getAddress(curve) });
      } else {
        partial = true;
        curveRecords.push({ ...record, curve: null });
      }
    });
  }

  return { records: curveRecords, partial };
}

async function readCreatorRecords(records: CurveRecord[]) {
  const creatorRecords: CreatorRecord[] = [];
  let partial = records.some((record) => record.curve === null);
  const candidates = records.filter(
    (
      record,
    ): record is TokenRecord & {
      curve: `0x${string}`;
    } => record.curve !== null,
  );

  for (const batch of chunkItems(candidates, TOKEN_READ_BATCH_SIZE)) {
    const results = (await serverPublicClient.multicall({
      allowFailure: true,
      contracts: batch.map(({ curve }) => ({
        address: curve,
        abi: curveCreatorAbi,
        functionName: "creator" as const,
      })),
    })) as MulticallResult[];

    batch.forEach((record, position) => {
      const creator = successful<string>(results[position]);
      if (creator && isAddress(creator) && creator !== zeroAddress) {
        creatorRecords.push({ ...record, creator: getAddress(creator) });
      } else {
        partial = true;
      }
    });
  }

  return { records: creatorRecords, partial };
}

async function buildCreatorCatalog(): Promise<CreatorCatalog> {
  const counts = await readFactoryCounts();
  const slots = buildFactorySlots(counts.availableFactories);
  const tokens = await readTokenRecords(slots);
  const curves = await readCurveRecords(tokens.records);
  const creators = await readCreatorRecords(curves.records);

  return {
    records: creators.records,
    partial:
      counts.partial || tokens.partial || curves.partial || creators.partial,
  };
}

export function readOfficialCreatorCatalog() {
  if (creatorCatalogCache && creatorCatalogCache.expiresAt > Date.now()) {
    return Promise.resolve(creatorCatalogCache);
  }
  if (!creatorCatalogRequest) {
    creatorCatalogRequest = buildCreatorCatalog()
      .then((catalog) => {
        creatorCatalogCache = {
          ...catalog,
          expiresAt:
            Date.now() +
            (catalog.partial
              ? PARTIAL_CREATOR_CATALOG_CACHE_MS
              : CREATOR_CATALOG_CACHE_MS),
        };
        return catalog;
      })
      .finally(() => {
        creatorCatalogRequest = undefined;
      });
  }
  return creatorCatalogRequest;
}

export async function readOfficialCreatorAddresses() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const catalog = await Promise.race([
      readOfficialCreatorCatalog(),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), CREATOR_DISCOVERY_TIMEOUT_MS);
      }),
    ]);
    if (!catalog) return [];
    return uniqueCreatorAddresses(
      catalog.records.map((record) => record.creator),
    );
  } catch {
    return [];
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function validateCreatorProject(
  rawAddress: string,
): Promise<CreatorValidationResult> {
  const address = rawAddress.trim();
  if (!isAddress(address)) {
    return classifyCreatorValidation({
      addressState: "invalid",
      catalogState: "complete",
    });
  }

  const creator = getAddress(address);
  if (creator === zeroAddress) {
    return classifyCreatorValidation({
      address: creator,
      addressState: "zero",
      catalogState: "complete",
    });
  }

  try {
    const catalog = await readOfficialCreatorCatalog();
    return classifyCreatorValidation({
      address: creator,
      addressState: "valid",
      catalogState: catalog.partial ? "partial" : "complete",
      creators: catalog.records.map((record) => record.creator),
    });
  } catch {
    return classifyCreatorValidation({
      address: creator,
      addressState: "valid",
      catalogState: "unavailable",
    });
  }
}
