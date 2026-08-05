import { isAddress } from "viem";
import { holderRewardsFactoryAbi } from "./holder-rewards-factory-deployment";

const configured = process.env.NEXT_PUBLIC_BNBX_HOLDER_REWARDS_FACTORY_ADDRESS;

// No fallback is intentional: the independent template stays unavailable
// until its separately audited Factory address is explicitly configured.
export const holderRewardsFactoryAddress =
  configured && isAddress(configured)
    ? (configured as `0x${string}`)
    : undefined;

export { holderRewardsFactoryAbi };
