export type MirrorDeployBlocker =
  | "wallet-required"
  | "unauthorized-wallet"
  | "wrong-chain"
  | "ineligible"
  | "busy";

export const FOUR_MIRROR_OPERATOR_WALLET =
  "0x50ce802BC302Ba36CD91D26f4b3AafeB631806D3" as const;

export function resolveFourMirrorAuthorizedWallets(primaryWallet: string) {
  return Array.from(
    new Set(
      [primaryWallet, FOUR_MIRROR_OPERATOR_WALLET].map((wallet) =>
        wallet.toLowerCase(),
      ),
    ),
  );
}

export function resolveMirrorDeployBlocker({
  isConnected,
  address,
  authorizedWallets,
  chainId,
  eligible,
  busy,
}: {
  isConnected: boolean;
  address?: string;
  authorizedWallets: readonly string[];
  chainId: number;
  eligible: boolean;
  busy: boolean;
}): MirrorDeployBlocker | null {
  if (!isConnected || !address) return "wallet-required";
  if (
    !authorizedWallets.some(
      (wallet) => wallet.toLowerCase() === address.toLowerCase(),
    )
  ) {
    return "unauthorized-wallet";
  }
  if (chainId !== 56) return "wrong-chain";
  if (!eligible) return "ineligible";
  if (busy) return "busy";
  return null;
}
