import { isAddress, parseEther } from "viem";
import { bsc } from "wagmi/chains";
import { STANDARD_CREATE_GAS_LIMIT } from "./advanced-template-config.ts";
import { zeroTaxFactoryAddress } from "./deployments.ts";
import { zeroTaxFactoryDeploymentAbi } from "./zero-tax-factory-deployment.ts";

export const FOUR_MIRROR_CREATION_FEE = parseEther("0.001");

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
  if (!Number.isInteger(graduationTargetBNB) || graduationTargetBNB < 1 || graduationTargetBNB > 18) {
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
    address: zeroTaxFactoryAddress,
    abi: zeroTaxFactoryDeploymentAbi,
    functionName: "createVanityToken",
    args: [
      {
        name: name.trim(),
        symbol: symbol.trim(),
        graduationTargetBNB,
        metadataURI,
        vanitySalt,
      },
    ],
    value: FOUR_MIRROR_CREATION_FEE,
    gas: STANDARD_CREATE_GAS_LIMIT,
    chain: bsc,
    account,
  } as const;
}
