import { NextRequest, NextResponse } from "next/server";
import { isAddress, zeroAddress } from "viem";
import { readOfficialCreatorCatalog } from "@/lib/creator-project-server";
import { officialFactoryAddresses } from "@/lib/deployments";
import {
  buildFactorySlots,
  chunkItems,
  hasCompleteMarketEntryRead,
} from "@/lib/market-data-core";
import { serverPublicClient } from "@/lib/server-chain";
import { validateTokenProject } from "@/lib/token-project-server";
import type { ProjectValidationResult } from "@/lib/project-validation-core";

export const dynamic = "force-dynamic";

const MAX_VISIBLE_TOKENS_PER_FACTORY = 8;
const TOKEN_READ_BATCH_SIZE = 100;
const ENTRY_READ_BATCH_SIZE = 20;

const factoryReadAbi = [
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
  {
    type: "function",
    name: "tokenMetadataURI",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "metadataURI", type: "string" }],
  },
] as const;

const tokenReadAbi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "launchManager",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "graduationAuthority",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "liquidityPairUnlocked",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
] as const;

const curveReadAbi = [
  {
    type: "function",
    name: "realBNBPrincipal",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "graduationTarget",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "state",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "creator",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "liquidityPair",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

type MulticallResult =
  | { status: "success"; result: unknown }
  | { status: "failure"; error: unknown };

function successful<T>(result: MulticallResult | undefined) {
  return result?.status === "success" ? (result.result as T) : undefined;
}

function responseHeaders(status: "fresh" | "partial") {
  return {
    "Cache-Control": "public, s-maxage=10, stale-while-revalidate=300",
    "X-BNBX-Data-Status": status,
  };
}

type FactorySlot = {
  factory: `0x${string}`;
  factoryOrder: number;
  index: bigint;
  creationIndex: number;
};

type TokenRecord = FactorySlot & {
  token: `0x${string}`;
};

type CurveRecord = TokenRecord & {
  curve: `0x${string}` | null;
};

type MarketEntry = {
  token: `0x${string}`;
  factory: `0x${string}`;
  factoryOrder: number;
  curve: `0x${string}` | null;
  creationIndex: number;
  name: string | null;
  symbol: string | null;
  totalSupply: string | null;
  metadataURI: string | null;
  principal: string | null;
  target: string | null;
  state: number | null;
  creator: `0x${string}` | null;
  liquidityPair: `0x${string}` | null;
};

async function readFactoryCounts() {
  const countResults = await serverPublicClient.multicall({
    allowFailure: true,
    contracts: officialFactoryAddresses.map((address) => ({
      address,
      abi: factoryReadAbi,
      functionName: "tokenCount" as const,
    })),
  });
  const availableFactories = officialFactoryAddresses.flatMap(
    (factory, position) => {
      const count = successful<bigint>(countResults[position]);
      return count === undefined ? [] : [{ factory, count }];
    },
  );
  if (availableFactories.length === 0) {
    throw new Error("All official Factory reads failed");
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
    const results = await serverPublicClient.multicall({
      allowFailure: true,
      contracts: batch.map(({ factory, index }) => ({
        address: factory,
        abi: factoryReadAbi,
        functionName: "allTokens" as const,
        args: [index] as const,
      })),
    });
    batch.forEach((slot, position) => {
      const token = successful<`0x${string}`>(results[position]);
      if (token && token !== zeroAddress) records.push({ ...slot, token });
      else partial = true;
    });
  }
  return { records, partial };
}

async function readCurveRecords(records: TokenRecord[]) {
  const curveRecords: CurveRecord[] = [];
  let partial = false;
  for (const batch of chunkItems(records, TOKEN_READ_BATCH_SIZE)) {
    const results = await serverPublicClient.multicall({
      allowFailure: true,
      contracts: batch.map(({ factory, token }) => ({
        address: factory,
        abi: factoryReadAbi,
        functionName: "curveOf" as const,
        args: [token] as const,
      })),
    });
    batch.forEach((record, position) => {
      const curve = successful<`0x${string}`>(results[position]);
      const validCurve = curve && curve !== zeroAddress ? curve : null;
      if (!validCurve) partial = true;
      curveRecords.push({ ...record, curve: validCurve });
    });
  }
  return { records: curveRecords, partial };
}

async function readEntries(records: CurveRecord[], initialPartial: boolean) {
  const entries: MarketEntry[] = [];
  let partial = initialPartial;
  for (const batch of chunkItems(records, ENTRY_READ_BATCH_SIZE)) {
    const [identityResults, curveResults] = await Promise.all([
      serverPublicClient.multicall({
        allowFailure: true,
        contracts: batch.flatMap(({ factory, token }) => [
          {
            address: token,
            abi: tokenReadAbi,
            functionName: "name" as const,
          },
          {
            address: token,
            abi: tokenReadAbi,
            functionName: "symbol" as const,
          },
          {
            address: token,
            abi: tokenReadAbi,
            functionName: "totalSupply" as const,
          },
          {
            address: factory,
            abi: factoryReadAbi,
            functionName: "tokenMetadataURI" as const,
            args: [token] as const,
          },
        ]),
      }),
      serverPublicClient.multicall({
        allowFailure: true,
        contracts: batch.flatMap(({ curve }) =>
          curve
            ? [
                {
                  address: curve,
                  abi: curveReadAbi,
                  functionName: "realBNBPrincipal" as const,
                },
                {
                  address: curve,
                  abi: curveReadAbi,
                  functionName: "graduationTarget" as const,
                },
                {
                  address: curve,
                  abi: curveReadAbi,
                  functionName: "state" as const,
                },
                {
                  address: curve,
                  abi: curveReadAbi,
                  functionName: "creator" as const,
                },
                {
                  address: curve,
                  abi: curveReadAbi,
                  functionName: "liquidityPair" as const,
                },
              ]
            : [],
        ),
      }),
    ]);
    let curveResultPosition = 0;
    batch.forEach((record, position) => {
      const stats = record.curve
        ? curveResults.slice(curveResultPosition, curveResultPosition + 5)
        : [];
      if (record.curve) curveResultPosition += 5;
      const name = successful<string>(identityResults[position * 4]);
      const symbol = successful<string>(identityResults[position * 4 + 1]);
      const totalSupply = successful<bigint>(identityResults[position * 4 + 2]);
      const metadataURI = successful<string>(identityResults[position * 4 + 3]);
      const principal = successful<bigint>(stats[0]);
      const target = successful<bigint>(stats[1]);
      const state = successful<number>(stats[2]);
      const creator = successful<`0x${string}`>(stats[3]);
      const liquidityPair = successful<`0x${string}`>(stats[4]);
      if (
        !hasCompleteMarketEntryRead({
          name,
          symbol,
          totalSupply,
          metadataURI,
          curve: record.curve,
          principal,
          target,
          state,
          creator,
          liquidityPair,
        })
      ) {
        partial = true;
      }
      entries.push({
        token: record.token,
        factory: record.factory,
        factoryOrder: record.factoryOrder,
        curve: record.curve,
        creationIndex: record.creationIndex,
        name: name ?? null,
        symbol: symbol ?? null,
        totalSupply: totalSupply?.toString() ?? null,
        metadataURI: metadataURI ?? null,
        principal: principal?.toString() ?? null,
        target: target?.toString() ?? null,
        state: state ?? null,
        creator: creator ?? null,
        liquidityPair: liquidityPair ?? null,
      });
    });
  }

  return {
    entries,
    dataStatus: partial ? ("partial" as const) : ("fresh" as const),
  };
}

async function readMarket() {
  const counts = await readFactoryCounts();
  const slots = buildFactorySlots(
    counts.availableFactories,
    MAX_VISIBLE_TOKENS_PER_FACTORY,
  );
  const tokens = await readTokenRecords(slots);
  const curves = await readCurveRecords(tokens.records);
  return readEntries(
    curves.records,
    counts.partial || tokens.partial || curves.partial,
  );
}

async function readCreatorMarket(creator: `0x${string}`) {
  const catalog = await readOfficialCreatorCatalog();
  const normalizedCreator = creator.toLowerCase();
  return readEntries(
    catalog.records
      .filter((record) => record.creator.toLowerCase() === normalizedCreator)
      .map((record) => ({
        ...record,
        factoryOrder: officialFactoryAddresses.findIndex(
          (factory) => factory.toLowerCase() === record.factory.toLowerCase(),
        ),
      })),
    catalog.partial,
  );
}

type ValidProject = Extract<ProjectValidationResult, { status: "valid" }>;

async function readToken({ token, factory, curve }: ValidProject) {
  const detailResults = await serverPublicClient.multicall({
    allowFailure: true,
    contracts: [
      { address: token, abi: tokenReadAbi, functionName: "name" },
      { address: token, abi: tokenReadAbi, functionName: "symbol" },
      { address: token, abi: tokenReadAbi, functionName: "totalSupply" },
      { address: token, abi: tokenReadAbi, functionName: "launchManager" },
      {
        address: token,
        abi: tokenReadAbi,
        functionName: "graduationAuthority",
      },
      {
        address: token,
        abi: tokenReadAbi,
        functionName: "liquidityPairUnlocked",
      },
      {
        address: token,
        abi: tokenReadAbi,
        functionName: "balanceOf",
        args: [curve],
      },
      {
        address: factory,
        abi: factoryReadAbi,
        functionName: "tokenMetadataURI",
        args: [token],
      },
      {
        address: curve,
        abi: curveReadAbi,
        functionName: "realBNBPrincipal",
      },
      {
        address: curve,
        abi: curveReadAbi,
        functionName: "graduationTarget",
      },
      { address: curve, abi: curveReadAbi, functionName: "state" },
      { address: curve, abi: curveReadAbi, functionName: "creator" },
      {
        address: curve,
        abi: curveReadAbi,
        functionName: "liquidityPair",
      },
    ],
  });
  const value = <T>(position: number) => successful<T>(detailResults[position]);
  const detail = {
    token,
    factory,
    curve,
    name: value<string>(0) ?? null,
    symbol: value<string>(1) ?? null,
    totalSupply: value<bigint>(2)?.toString() ?? null,
    launchManager: value<`0x${string}`>(3) ?? null,
    graduationAuthority: value<`0x${string}`>(4) ?? null,
    pairUnlocked: value<boolean>(5) ?? null,
    curveTokenBalance: value<bigint>(6)?.toString() ?? null,
    metadataURI: value<string>(7) ?? null,
    principal: value<bigint>(8)?.toString() ?? null,
    target: value<bigint>(9)?.toString() ?? null,
    state: value<number>(10) ?? null,
    creator: value<`0x${string}`>(11) ?? null,
    liquidityPair: value<`0x${string}`>(12) ?? null,
  };
  const partial = Object.values(detail).some((item) => item === null);
  return {
    detail,
    dataStatus: partial ? ("partial" as const) : ("fresh" as const),
  };
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const creator = request.nextUrl.searchParams.get("creator");
  if (token && !isAddress(token)) {
    return NextResponse.json(
      { error: "Invalid token address" },
      { status: 400 },
    );
  }
  if (creator && !isAddress(creator)) {
    return NextResponse.json(
      { error: "Invalid creator address" },
      { status: 400 },
    );
  }
  if (token && creator) {
    return NextResponse.json(
      { error: "Choose either token or creator mode" },
      { status: 400 },
    );
  }
  try {
    if (token) {
      const project = await validateTokenProject(token);
      if (project.status === "not_found") {
        return NextResponse.json(
          {
            code: "PROJECT_NOT_FOUND",
            error: "Token is not registered by an official BNBX Factory",
          },
          { status: 404 },
        );
      }
      if (project.status === "unavailable") {
        return NextResponse.json(
          {
            code: "PROJECT_VALIDATION_UNAVAILABLE",
            error: "BNB Chain project validation is temporarily unavailable",
          },
          { status: 503 },
        );
      }
      const result = await readToken(project);
      return NextResponse.json(result, {
        headers: responseHeaders(result.dataStatus),
      });
    }
    if (creator) {
      const result = await readCreatorMarket(creator as `0x${string}`);
      return NextResponse.json(result, {
        headers: responseHeaders(result.dataStatus),
      });
    }
    const result = await readMarket();
    return NextResponse.json(result, {
      headers: responseHeaders(result.dataStatus),
    });
  } catch {
    return NextResponse.json(
      { error: "BNB Chain data is temporarily unavailable" },
      { status: 503 },
    );
  }
}
