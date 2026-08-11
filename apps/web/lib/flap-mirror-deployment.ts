import { isAddress, parseEther } from "viem";
import { bsc } from "wagmi/chains";
import { ADVANCED_CREATE_GAS_LIMIT } from "./advanced-template-config.ts";
import { holderRewardsFactoryAddress } from "./deployments.ts";
import { holderRewardsFactoryAbi } from "./holder-rewards-factory-deployment.ts";
import {
  buildMirrorHolderRewardsTokenRequest,
  MIRROR_GRADUATION_TARGET_BNB,
} from "./mirror-holder-rewards.ts";

export const FLAP_MIRROR_CREATION_FEE = parseEther("0.001");

export type FlapMirrorOperatorSession = {
  wallet: string;
  expiresAt: number;
};

export function shouldReuseFlapMirrorSession(
  session: FlapMirrorOperatorSession | null,
  wallet: string,
  now = Date.now(),
) {
  return Boolean(
    session &&
      session.wallet === wallet.toLowerCase() &&
      session.expiresAt > now,
  );
}

export class SubmittedFlapMirrorTransactionError extends Error {
  transactionHash: `0x${string}`;

  constructor(transactionHash: `0x${string}`, cause: unknown) {
    super("Flap mirror transaction was already submitted; receipt status is uncertain", {
      cause,
    });
    this.name = "SubmittedFlapMirrorTransactionError";
    this.transactionHash = transactionHash;
  }
}

export function isSubmittedFlapMirrorTransaction(
  error: unknown,
): error is SubmittedFlapMirrorTransactionError {
  return error instanceof SubmittedFlapMirrorTransactionError;
}

export function buildFlapMirrorCreateRequest({
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
    value: FLAP_MIRROR_CREATION_FEE,
    gas: ADVANCED_CREATE_GAS_LIMIT,
    chain: bsc,
    account,
  } as const;
}
