import { isAddress } from "viem";
import { holderRewardsFactoryAbi } from "./holder-rewards-factory-deployment";

const configured = process.env.NEXT_PUBLIC_BNBX_HOLDER_REWARDS_FACTORY_ADDRESS;
const mainnetFactory =
  "0xcc1ffca6985658de357f3f5763fd1ff690074625" as const;

export const holderRewardsFactoryAddress =
  configured && isAddress(configured)
    ? (configured as `0x${string}`)
    : mainnetFactory;

export { holderRewardsFactoryAbi };
