import { NextResponse } from "next/server";
import {
  createPublicClient,
  decodeEventLog,
  fallback,
  http,
  isAddress,
  isHash,
} from "viem";
import { bsc } from "viem/chains";
import { advancedFactoryAbi } from "@/lib/advanced-factory-abi";
import {
  v4RewardsFactoryAddress,
  v4StandardFactoryAddress,
} from "@/lib/deployments";
import { factoryDeploymentAbi } from "@/lib/factory-deployment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GITHUB_OWNER = "xuxi1234";
const GITHUB_REPOSITORY = "bnbxmeme";
const GITHUB_WORKFLOW = "verify-bsc-mainnet.yml";
const TOKEN_DEPLOYER_ADDRESS = "0x6Be576ab1b2874641DE5Ac41069C57a16A5C892c";
const MAX_CONFIRMATION_AGE_BLOCKS = 200n;

const client = createPublicClient({
  chain: bsc,
  transport: fallback([
    ...(process.env.BSC_MAINNET_RPC_URL
      ? [http(process.env.BSC_MAINNET_RPC_URL, { timeout: 12_000 })]
      : []),
    http("https://bsc-rpc.publicnode.com", { timeout: 12_000 }),
    http("https://bsc.drpc.org", { timeout: 12_000 }),
  ]),
});

const githubHeaders = (token: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  "X-GitHub-Api-Version": "2022-11-28",
});

function officialCreationFromReceipt(
  logs: Awaited<ReturnType<typeof client.getTransactionReceipt>>["logs"],
) {
  for (const log of logs) {
    const factory = log.address.toLowerCase();
    const abi =
      factory === v4StandardFactoryAddress.toLowerCase()
        ? factoryDeploymentAbi
        : factory === v4RewardsFactoryAddress.toLowerCase()
          ? advancedFactoryAbi
          : null;
    if (!abi) continue;

    try {
      const decoded = decodeEventLog({
        abi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== "TokenCreated") continue;
      const args = decoded.args as {
        token?: `0x${string}`;
        curve?: `0x${string}`;
      };
      if (!args.token || !args.curve) continue;
      if (!isAddress(args.token) || !isAddress(args.curve)) continue;
      return { factory: log.address, token: args.token, curve: args.curve };
    } catch {
      // A creation receipt includes child-contract and ERC-20 events too.
    }
  }
  return null;
}

async function wasAlreadyDispatched(token: string, transactionHash: string) {
  const url = new URL(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/actions/workflows/${GITHUB_WORKFLOW}/runs`,
  );
  url.searchParams.set("event", "workflow_dispatch");
  url.searchParams.set("per_page", "100");
  const response = await fetch(url, {
    headers: githubHeaders(token),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return false;
  const payload = (await response.json()) as {
    workflow_runs?: Array<{ display_title?: string }>;
  };
  const needle = transactionHash.toLowerCase();
  return Boolean(
    payload.workflow_runs?.some((run) =>
      run.display_title?.toLowerCase().includes(needle),
    ),
  );
}

async function dispatchVerification(token: string, transactionHash: string) {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: githubHeaders(token),
      cache: "no-store",
      body: JSON.stringify({
        ref: "main",
        inputs: {
          standard_factory_address: v4StandardFactoryAddress,
          rewards_factory_address: v4RewardsFactoryAddress,
          token_deployer_address: TOKEN_DEPLOYER_ADDRESS,
          verify_launched_tokens: true,
          launch_tx_hash: transactionHash,
        },
      }),
    },
  ).catch(() => null);
  return response?.status === 204;
}

export async function POST(request: Request) {
  const githubToken = process.env.BNBX_GITHUB_ACTIONS_TOKEN;
  if (!githubToken) {
    return NextResponse.json(
      { error: "Immediate verification is not configured" },
      { status: 503 },
    );
  }

  let input: { transactionHash?: string };
  try {
    input = (await request.json()) as typeof input;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const transactionHash = input.transactionHash?.trim() ?? "";
  if (!isHash(transactionHash)) {
    return NextResponse.json(
      { error: "Invalid transaction hash" },
      { status: 400 },
    );
  }

  const [receipt, latestBlock] = await Promise.all([
    client.getTransactionReceipt({ hash: transactionHash }).catch(() => null),
    client.getBlockNumber().catch(() => null),
  ]);
  if (!receipt || receipt.status !== "success") {
    return NextResponse.json(
      { error: "Confirmed launch transaction not found" },
      { status: 404 },
    );
  }
  if (
    latestBlock === null ||
    receipt.blockNumber > latestBlock ||
    latestBlock - receipt.blockNumber > MAX_CONFIRMATION_AGE_BLOCKS
  ) {
    return NextResponse.json(
      {
        error:
          "Launch transaction is outside the immediate verification window",
      },
      { status: 409 },
    );
  }

  const creation = officialCreationFromReceipt(receipt.logs);
  if (!creation) {
    return NextResponse.json(
      { error: "Transaction is not an official BNBX launch" },
      { status: 403 },
    );
  }

  if (await wasAlreadyDispatched(githubToken, transactionHash)) {
    return NextResponse.json({
      ok: true,
      alreadyDispatched: true,
      ...creation,
    });
  }

  const dispatched = await dispatchVerification(githubToken, transactionHash);
  if (!dispatched) {
    return NextResponse.json(
      { error: "Immediate verification could not be queued" },
      { status: 502 },
    );
  }

  return NextResponse.json(
    { ok: true, alreadyDispatched: false, ...creation },
    { status: 202 },
  );
}
