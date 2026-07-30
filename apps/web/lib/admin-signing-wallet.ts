import { isAddress } from "viem";

export const DEFAULT_ADMIN_SIGNING_WALLET =
  "0xbE37AB912De351B9312FA593C9f99e3279FDB0a2" as const;

const PLATFORM_REVENUE_WALLET =
  "0xDAF4f62914f7F64c9eabFd473F4dB4b7e74048A6" as const;

export function resolveAdminSigningWallet(configured?: string) {
  const wallet = configured?.trim();
  if (
    !wallet ||
    !isAddress(wallet) ||
    wallet.toLowerCase() === PLATFORM_REVENUE_WALLET.toLowerCase()
  ) {
    return DEFAULT_ADMIN_SIGNING_WALLET.toLowerCase();
  }
  return wallet.toLowerCase();
}
