import { decodeEventLog, isAddress, zeroHash, type Hex } from "viem";
import { holderRewardsFactoryAddress } from "./deployments.ts";
import { holderRewardsFactoryAbi } from "./holder-rewards-factory-deployment.ts";

export const MIRROR_GRADUATION_TARGET_BNB = 1;
export const MIRROR_REWARD_TOKEN =
  "0x55d398326f99059ff775485246999027b3197955";
export const MIRROR_MINIMUM_REWARD_BALANCE = 1_000_000n * 10n ** 18n;

const MIRROR_REWARD_TAXES = {
  liquidity: 0,
  rewards: 300,
  burn: 0,
} as const;

export function buildMirrorHolderRewardsTokenRequest({
  name,
  symbol,
  metadataURI,
  vanitySalt,
}: {
  name: string;
  symbol: string;
  metadataURI: string;
  vanitySalt: Hex;
}) {
  return {
    name: name.trim(),
    symbol: symbol.trim(),
    graduationTargetBNB: MIRROR_GRADUATION_TARGET_BNB,
    metadataURI,
    vanitySalt,
    rewardToken: MIRROR_REWARD_TOKEN,
    taxes: {
      buy: MIRROR_REWARD_TAXES,
      sell: MIRROR_REWARD_TAXES,
    },
    minimumRewardBalance: MIRROR_MINIMUM_REWARD_BALANCE,
  } as const;
}

export function buildMirrorHolderRewardsVanityCall({
  name,
  symbol,
  metadataURI,
  start,
  maxIterations,
}: {
  name: string;
  symbol: string;
  metadataURI: string;
  start: bigint;
  maxIterations: bigint;
}) {
  return {
    address: holderRewardsFactoryAddress,
    abi: holderRewardsFactoryAbi,
    functionName: "findVanitySalt",
    args: [
      buildMirrorHolderRewardsTokenRequest({
        name,
        symbol,
        metadataURI,
        vanitySalt: zeroHash,
      }),
      start,
      maxIterations,
    ],
  } as const;
}

export function decodeMirrorHolderCreatedToken(
  logs: readonly {
    address: string;
    data: Hex;
    topics: readonly Hex[];
  }[],
) {
  for (const log of logs) {
    if (log.address.toLowerCase() !== holderRewardsFactoryAddress.toLowerCase()) {
      continue;
    }
    if (log.topics.length === 0) continue;
    try {
      const decoded = decodeEventLog({
        abi: holderRewardsFactoryAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName !== "TokenCreated") continue;
      const args = decoded.args as { token?: `0x${string}` };
      if (args.token && isAddress(args.token)) return args.token;
    } catch {
      // Ignore unrelated or malformed logs from the same receipt.
    }
  }
  return null;
}
