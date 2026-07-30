import "server-only";

import {
  verifyMessage as verifyEoaMessage,
  type Address,
  type Hex,
  type SignableMessage,
} from "viem";
import { serverPublicClient } from "@/lib/server-chain";
import { verifyWithSmartWalletFallback } from "@/lib/comment-signature-core";

export function verifyWalletMessage({
  address,
  message,
  signature,
}: {
  address: Address;
  message: SignableMessage;
  signature: Hex;
}) {
  return verifyWithSmartWalletFallback(
    () => verifyEoaMessage({ address, message, signature }),
    () => serverPublicClient.verifyMessage({ address, message, signature }),
  );
}
