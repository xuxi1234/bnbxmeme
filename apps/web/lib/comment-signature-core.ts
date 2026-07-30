export const MAX_COMMENT_SIGNATURE_BYTES = 8_192;
export const MAX_ADMIN_SIGNATURE_BYTES = 1_024;

export function isSupportedWalletSignature(
  signature: string,
  maxBytes = MAX_COMMENT_SIGNATURE_BYTES,
) {
  const hexLength = signature.length - 2;
  return (
    maxBytes > 0 &&
    signature.startsWith("0x") &&
    hexLength >= 2 &&
    hexLength <= maxBytes * 2 &&
    hexLength % 2 === 0 &&
    /^[0-9a-fA-F]+$/.test(signature.slice(2))
  );
}

export async function verifyWithSmartWalletFallback(
  verifyEoa: () => Promise<boolean>,
  verifyOnchain: () => Promise<boolean>,
) {
  try {
    if (await verifyEoa()) return true;
  } catch {}
  try {
    return await verifyOnchain();
  } catch {
    return false;
  }
}
