export type MirrorDeployBlocker =
  | "wallet-required"
  | "wrong-chain"
  | "ineligible"
  | "busy";

export function resolveMirrorDeployBlocker({
  isConnected,
  address,
  chainId,
  eligible,
  busy,
}: {
  isConnected: boolean;
  address?: string;
  chainId: number;
  eligible: boolean;
  busy: boolean;
}): MirrorDeployBlocker | null {
  if (!isConnected || !address) return "wallet-required";
  if (chainId !== 56) return "wrong-chain";
  if (!eligible) return "ineligible";
  if (busy) return "busy";
  return null;
}
