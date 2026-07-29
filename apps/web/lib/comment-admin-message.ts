import { getAddress } from "viem";

export function buildCommentAdminLoginMessage({
  wallet,
  signedAt,
}: {
  wallet: string;
  signedAt: string;
}) {
  return [
    "BNBX Comment Moderation",
    "",
    "Authorize this wallet to manage BNBX project discussions.",
    "This signature does not send a transaction or spend gas.",
    "",
    `Wallet: ${getAddress(wallet)}`,
    "Chain ID: 56",
    `Issued At: ${signedAt}`,
  ].join("\n");
}
