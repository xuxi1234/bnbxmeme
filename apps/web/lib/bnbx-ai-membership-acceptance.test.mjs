import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [
  component,
  paymentRoute,
  chatRoute,
  auth,
  membership,
  migration,
  css,
  copy,
] = await Promise.all([
  readFile(
    new URL("../components/bnbx-ai-assistant.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../app/api/bnbx-ai/payment/route.ts", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../app/api/bnbx-ai/chat/route.ts", import.meta.url),
    "utf8",
  ),
  readFile(new URL("bnbx-ai-auth.ts", import.meta.url), "utf8"),
  readFile(new URL("bnbx-ai-membership.ts", import.meta.url), "utf8"),
  readFile(
    new URL(
      "../../../supabase/migrations/20260805070000_bnbx_ai_permanent_credit.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(new URL("../app/bnbx-ai.css", import.meta.url), "utf8"),
  readFile(new URL("bnbx-ai-copy.ts", import.meta.url), "utf8"),
]);

test("charges exactly 1 BNB to the approved BSC recipient", () => {
  const recipient = "0x3c97e99441cf86778d81fd6fef61bda84be9634a";
  assert.match(component, new RegExp(recipient));
  assert.match(component, /value:\s*parseEther\("1"\)/);
  assert.match(component, /chainId:\s*bsc\.id/);
  assert.match(membership, new RegExp(recipient));
  assert.match(membership, /BNBX_AI_PAYMENT_WEI = 1_000_000_000_000_000_000n/);
  assert.doesNotMatch(copy, /0\.1 BNB/);
});

test("credits only a confirmed direct payment from the connected wallet", () => {
  assert.match(paymentRoute, /confirmations:\s*2/);
  assert.match(paymentRoute, /receipt\.status !== "success"/);
  assert.match(paymentRoute, /transaction\.from\.toLowerCase\(\) !== wallet/);
  assert.match(
    paymentRoute,
    /transaction\.to\?\.toLowerCase\(\) !== BNBX_AI_PAYMENT_ADDRESS/,
  );
  assert.match(paymentRoute, /transaction\.value < BNBX_AI_PAYMENT_WEI/);
});

test("makes membership permanent and does not advertise a personal credit cutoff", () => {
  assert.match(membership, /BNBX_AI_CREDIT_MICROUSD = 68_000_000/);
  assert.doesNotMatch(copy, /68 USDT|100 USDT/);
  assert.match(copy, /正常使用不按个人额度中断/);
  assert.match(migration, /permanent_member boolean not null default true/);
  assert.match(migration, /tx_hash text primary key/);
  assert.match(migration, /on conflict \(tx_hash\) do nothing/);
  assert.match(
    migration,
    /credit_microusd = public\.bnbx_ai_members\.credit_microusd \+ excluded\.credit_microusd/,
  );
});

test("keeps paid membership data server-only behind RLS", () => {
  for (const table of [
    "bnbx_ai_members",
    "bnbx_ai_payments",
    "bnbx_ai_credit_reservations",
  ]) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security`),
    );
    assert.match(
      migration,
      new RegExp(
        `revoke all on public\\.${table} from public, anon, authenticated`,
      ),
    );
  }
  assert.match(
    migration,
    /grant execute on function public\.record_bnbx_ai_payment[\s\S]*to service_role/,
  );
});

test("replaces the one-BNB balance gate with paid membership plus signature", () => {
  assert.doesNotMatch(auth, /getBalance|More than 1 BNB|MIN_BALANCE/);
  assert.match(auth, /await assertAiMember\(address\)/);
  assert.match(component, /signMessageAsync/);
  assert.match(copy, /永久开通 BNBX AI/);
  assert.match(copy, /领取专属于您的小壹 \/ X-One/);
});

test("localizes the complete X-One experience in all four site languages", () => {
  for (const language of ["zh", "en", "ko", "ja"]) {
    assert.match(copy, new RegExp(`\\b${language}: \\{`));
  }
  assert.match(component, /useLanguage\(\)/);
  assert.match(component, /bnbxAiCopy\[language\]/);
  assert.match(component, /JSON\.stringify\(\{ messages: next, language \}\)/);
  assert.match(chatRoute, /The interface language is/);
});

test("shows staged payment feedback and a useful My X-One summary", () => {
  assert.match(component, /setPaymentStage\("wallet"\)/);
  assert.match(component, /setPaymentStage\("submitted"\)/);
  assert.match(component, /setPaymentStage\("verifying"\)/);
  assert.match(component, /setPaymentStage\("success"\)/);
  assert.match(component, /className="bnbx-ai-membership"/);
  assert.match(component, /membership\.paymentCount/);
  assert.match(css, /bnbx-ai-payment-progress/);
});

test("lets paid members chat without consuming a per-member credit balance", () => {
  assert.match(chatRoute, /await requireSession\(request\)/);
  assert.doesNotMatch(
    chatRoute,
    /reserveAiCredit|settleAiCredit|aiCostMicrousd/,
  );
  assert.doesNotMatch(component, /membership\.creditMicrousd > 0/);
  assert.doesNotMatch(component, /membership\.creditMicrousd <= 0/);
});

test("trims old X-One history instead of rejecting a valid later turn", () => {
  assert.match(chatRoute, /function trimConversationHistory/);
  assert.match(chatRoute, /trimmed\.length > 1/);
  assert.match(chatRoute, /trimmed\.shift\(\)/);
  assert.doesNotMatch(chatRoute, /JSON\.stringify\(messages\)\.length > 8000/);
});

test("gives mobile and desktop the same draggable X-One behavior", () => {
  assert.doesNotMatch(component, /window\.innerWidth < 720\) return/);
  assert.match(component, /onPointerMove/);
  assert.match(component, /POSITION_KEY/);
  assert.match(component, /localStorage\.setItem/);
  assert.match(component, /suppressClick/);
  assert.match(css, /touch-action: none/);
  assert.match(component, /setPointerCapture/);
  assert.match(component, /requestAnimationFrame/);
  assert.match(component, /translate3d/);
  assert.doesNotMatch(component, /BSC 主网 · 官方收款地址/);
  assert.doesNotMatch(css, /right: 14px !important/);
  assert.doesNotMatch(css, /bottom: 82px !important/);
});
