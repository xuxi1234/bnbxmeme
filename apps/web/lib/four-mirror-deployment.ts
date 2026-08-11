import { isAddress, parseEther } from "viem";
import { bsc } from "wagmi/chains";
import { ADVANCED_CREATE_GAS_LIMIT } from "./advanced-template-config.ts";
import { holderRewardsFactoryAddress } from "./deployments.ts";
import { holderRewardsFactoryAbi } from "./holder-rewards-factory-deployment.ts";
import {
  buildMirrorHolderRewardsTokenRequest,
  MIRROR_GRADUATION_TARGET_BNB,
} from "./mirror-holder-rewards.ts";

export const FOUR_MIRROR_CREATION_FEE = parseEther("0.001");

export class SubmittedFourMirrorTransactionError extends Error {
  transactionHash: `0x${string}`;

  constructor(transactionHash: `0x${string}`, cause: unknown) {
    super("Four mirror transaction was submitted; receipt status is uncertain", {
      cause,
    });
    this.name = "SubmittedFourMirrorTransactionError";
    this.transactionHash = transactionHash;
  }
}

export function isSubmittedFourMirrorTransaction(
  error: unknown,
): error is SubmittedFourMirrorTransactionError {
  return error instanceof SubmittedFourMirrorTransactionError;
}

export function buildFourMirrorCreateRequest({
  account,
  name,
  symbol,
  graduationTargetBNB,
  metadataURI,
  vanitySalt,
}: {
  account: `0x${string}`;
  name: string;
  symbol: string;
  graduationTargetBNB: number;
  metadataURI: string;
  vanitySalt: `0x${string}`;
}) {
  if (!isAddress(account)) throw new Error("Invalid deployer wallet");
  if (!name.trim() || name.trim().length > 40) throw new Error("Invalid token name");
  if (!symbol.trim() || symbol.trim().length > 10) {
    throw new Error("Invalid token symbol");
  }
  if (graduationTargetBNB !== MIRROR_GRADUATION_TARGET_BNB) {
    throw new Error("Invalid graduation target");
  }
  if (
    !metadataURI.startsWith("ipfs://") ||
    new TextEncoder().encode(metadataURI).byteLength > 256
  ) {
    throw new Error("Invalid metadata URI");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(vanitySalt)) {
    throw new Error("Invalid vanity salt");
  }

  return {
    address: holderRewardsFactoryAddress,
    abi: holderRewardsFactoryAbi,
    functionName: "createVanityToken",
    args: [
      buildMirrorHolderRewardsTokenRequest({
        name,
        symbol,
        metadataURI,
        vanitySalt,
      }),
    ],
    value: FOUR_MIRROR_CREATION_FEE,
    gas: ADVANCED_CREATE_GAS_LIMIT,
    chain: bsc,
    account,
  } as const;
}
