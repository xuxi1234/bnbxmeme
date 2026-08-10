export type MirrorDeployBlocker =
  | "wallet-required"
  | "unauthorized-wallet"
  | "wrong-chain"
  | "ineligible"
  | "busy";

export function resolveMirrorDeployBlocker({
  isConnected,
  address,
  authorizedWallet,
  chainId,
  eligible,
  busy,
}: {
  isConnected: boolean;
  address?: string;
  authorizedWallet: string;
  chainId: number;
  eligible: boolean;
  busy: boolean;
}): MirrorDeployBlocker | null {
  if (!isConnected || !address) return "wallet-required";
  if (address.toLowerCase() !== authorizedWallet.toLowerCase()) {
    return "unauthorized-wallet";
  }
  if (chainId !== 56) return "wrong-chain";
  if (!eligible) return "ineligible";
  if (busy) return "busy";
  return null;
}
