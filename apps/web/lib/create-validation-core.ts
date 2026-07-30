export type CreateSubmitBlocker =
  | "wallet"
  | "factory"
  | "template"
  | "name"
  | "symbol"
  | "community"
  | "initialBuy"
  | "tax"
  | "rewards";

export function resolveCreateSubmitBlocker({
  isConnected,
  factoryAvailable,
  templateAvailable,
  name,
  symbol,
  communityValid,
  initialBuyValid,
  taxValid,
  rewardsValid,
}: {
  isConnected: boolean;
  factoryAvailable: boolean;
  templateAvailable: boolean;
  name: string;
  symbol: string;
  communityValid: boolean;
  initialBuyValid: boolean;
  taxValid: boolean;
  rewardsValid: boolean;
}): CreateSubmitBlocker | null {
  if (!isConnected) return "wallet";
  if (!factoryAvailable) return "factory";
  if (!templateAvailable) return "template";
  if (!name.trim()) return "name";
  if (!symbol.trim()) return "symbol";
  if (!communityValid) return "community";
  if (!initialBuyValid) return "initialBuy";
  if (!taxValid) return "tax";
  if (!rewardsValid) return "rewards";
  return null;
}
