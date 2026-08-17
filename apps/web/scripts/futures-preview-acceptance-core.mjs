import { getAddress } from "viem";

const privateKeyPattern = /^0x[0-9a-fA-F]{64}$/;

// FuturesOracle deliberately fails closed when less than 350k gas remains.
// Automatic gas estimation therefore sees a successful CloseOnly return and
// can choose a limit that clears, rather than advances, the observation window.
export const ORACLE_UPDATE_GAS = 600_000n;

export async function retryServiceUnavailable(
  operation,
  {
    attempts = 4,
    wait = () => new Promise((resolve) => setTimeout(resolve, 5_000)),
  } = {},
) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (error?.message !== "service_unavailable" || attempt === attempts - 1)
        throw error;
      await wait();
    }
  }
  throw lastError;
}

export function validateAcceptanceEnvironment(environment) {
  const chainId = Number(environment.FUTURES_CHAIN_ID ?? "97");
  if (chainId !== 97)
    throw new Error("acceptance requires BSC Testnet chain 97");
  const preview = new URL(environment.FUTURES_PREVIEW_URL ?? "");
  if (
    preview.protocol !== "https:" ||
    !preview.hostname.endsWith(".vercel.app") ||
    !preview.hostname.includes("git-feat-bnbx-futures-phase-1-")
  ) {
    throw new Error("acceptance URL must be the Futures feature Preview");
  }
  const walletAKey = environment.FUTURES_WALLET_A_PRIVATE_KEY ?? "";
  const walletBKey = environment.FUTURES_WALLET_B_PRIVATE_KEY || undefined;
  if (!privateKeyPattern.test(walletAKey))
    throw new Error("an environment-only funding wallet key is required");
  if (walletBKey && !privateKeyPattern.test(walletBKey))
    throw new Error("the optional second wallet key is malformed");
  if (walletBKey && walletAKey.toLowerCase() === walletBKey.toLowerCase())
    throw new Error("acceptance wallets must be distinct");
  const rpcUrl = new URL(environment.FUTURES_RPC_URL ?? "");
  if (rpcUrl.protocol !== "https:")
    throw new Error("HTTPS testnet RPC required");
  return {
    chainId,
    preview: preview.origin,
    rpcUrl: rpcUrl.href,
    walletAKey,
    walletBKey,
    testUsdt: getAddress(environment.FUTURES_TEST_USDT ?? ""),
    clearingHouse: getAddress(environment.FUTURES_CLEARING_HOUSE ?? ""),
    orderBook: getAddress(environment.FUTURES_ORDER_BOOK ?? ""),
    oracle: getAddress(environment.FUTURES_ORACLE ?? ""),
  };
}

export function assertSanitizedEvidence(evidence, privateKeys) {
  const serialized = JSON.stringify(evidence);
  for (const key of privateKeys) {
    if (serialized.toLowerCase().includes(key.toLowerCase()))
      throw new Error("private key reached acceptance evidence");
  }
  return evidence;
}
