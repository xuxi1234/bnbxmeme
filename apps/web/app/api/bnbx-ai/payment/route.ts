import { NextResponse } from "next/server";
import { isAddress, isHash } from "viem";
import {
  BNBX_AI_PAYMENT_ADDRESS,
  BNBX_AI_PAYMENT_WEI,
  getAiMemberStatus,
  recordAiPayment,
} from "@/lib/bnbx-ai-membership";
import { serverPublicClient } from "@/lib/server-chain";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const address = new URL(request.url).searchParams.get("address") ?? "";
    if (!isAddress(address)) throw new Error("Invalid wallet address");
    return NextResponse.json(await getAiMemberStatus(address));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as { hash?: string; wallet?: string };
    if (
      !input.hash ||
      !isHash(input.hash) ||
      !input.wallet ||
      !isAddress(input.wallet)
    )
      throw new Error("Invalid payment request");
    const hash = input.hash.toLowerCase() as `0x${string}`;
    const wallet = input.wallet.toLowerCase();
    const receipt = await serverPublicClient.waitForTransactionReceipt({
      hash,
      confirmations: 2,
      timeout: 90_000,
    });
    if (receipt.status !== "success")
      throw new Error("Payment transaction failed");
    const transaction = await serverPublicClient.getTransaction({ hash });
    if (
      transaction.from.toLowerCase() !== wallet ||
      transaction.to?.toLowerCase() !== BNBX_AI_PAYMENT_ADDRESS ||
      transaction.value < BNBX_AI_PAYMENT_WEI
    )
      throw new Error("Payment details do not match");
    const status = await recordAiPayment({
      hash,
      wallet,
      amountWei: transaction.value,
      blockNumber: receipt.blockNumber,
    });
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Payment verification failed",
      },
      { status: 400 },
    );
  }
}
