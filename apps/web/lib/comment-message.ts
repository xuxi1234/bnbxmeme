export function buildCommentMessage(input: {
  token: string;
  wallet: string;
  body: string;
  signedAt: string;
}) {
  return [
    "BNBX Community Comment",
    "Chain: BNB Smart Chain (56)",
    `Token: ${input.token.toLowerCase()}`,
    `Wallet: ${input.wallet.toLowerCase()}`,
    `Signed at: ${input.signedAt}`,
    "",
    input.body.trim(),
  ].join("\n");
}
