import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  announcementCopy,
  resolveSecurityCopy,
  securityCopy,
} from "./security-copy.ts";
import { MAX_TEMPLATE_SIDE_TAX_PERCENT } from "./template-rules.ts";
import { buildSecurityAddressGroups } from "./security-addresses.ts";

const languages = ["zh", "en", "ko", "ja"];

function shape(value) {
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) return value.map(shape);
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, shape(nested)]),
  );
}

test("removes return promises and first-choice claims from the announcement", () => {
  const prohibited = {
    zh: /æ´é«çæ¶ç|é¦éå¹³å°/,
    en: /greater potential|first choice/i,
    ko: /ë ëì ì ì¬ë ¥|ì ííì¸ì/,
    ja: /é«ãå¯è½æ§|çºè¡ãããªãBNBX/,
  };

  for (const language of languages) {
    assert.doesNotMatch(announcementCopy[language], prohibited[language]);
  }
});

test("publishes the community launch message in every announcement", () => {
  assert.equal(
    announcementCopy.zh,
    "ä¸ä¸ªæ³æ³ï¼ä¸ä¸ªç¤¾åºï¼ä¸æä»£å¸ãå¨ BNBX.MEME ä½é¨æ§å¯å¨ä½ çç¤¾åºä»£å¸ï¼è´¹ç¨ä¸è§åå¬å¼éæï¼è¾¾æ åèªå¨è¿å¥ PancakeSwapã",
  );

  for (const language of languages) {
    assert.match(announcementCopy[language], /BNBX\.MEME/);
    assert.match(announcementCopy[language], /PancakeSwap/);
  }
});

test("keeps security disclosures complete in all four languages", () => {
  const expected = shape(securityCopy.zh);
  for (const language of languages) {
    const copy = resolveSecurityCopy(language, MAX_TEMPLATE_SIDE_TAX_PERCENT);
    assert.deepEqual(shape(copy), expected);
    assert.equal(copy.templateItems.length, 3);
    assert.equal(copy.dataItems.length, 3);
    assert.equal(copy.dataItems[0][0], "0");
    assert.match(
      copy.templateRuleHelp,
      new RegExp(`${MAX_TEMPLATE_SIDE_TAX_PERCENT}%`),
    );
    assert.doesNotMatch(copy.templateRuleHelp, /\{cap\}/);
  }
});

test("keeps the published tax cap aligned with contract enforcement", async () => {
  const source = await readFile(
    new URL(
      "../../../packages/contracts/src/libraries/TemplateConfigV3.sol",
      import.meta.url,
    ),
    "utf8",
  );
  const rawBasisPoints = source.match(/MAX_SIDE_TAX_BPS\s*=\s*([\d_]+);/)?.[1];
  assert.ok(rawBasisPoints, "contract tax cap is missing");
  const basisPoints = Number(rawBasisPoints.replaceAll("_", ""));
  assert.equal(basisPoints / 100, MAX_TEMPLATE_SIDE_TAX_PERCENT);
});

test("publishes Router, burn proof, and unavailable-data semantics", async () => {
  const [page, curve] = await Promise.all([
    readFile(new URL("../app/security/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../../../packages/contracts/src/BondingCurve.sol",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(page, /pancakeRouterAddress/);
  assert.match(page, /lpBurnAddress/);
  assert.match(page, /content\.templateItems/);
  assert.match(page, /content\.dataItems/);
  assert.match(page, /content\.lpProofText/);
  assert.match(curve, /\.mint\(LP_BURN_ADDRESS\)/);
});

test("publishes the five official domains and concise one-percent launch fees", async () => {
  const [curve, page] = await Promise.all([
    readFile(
      new URL(
        "../../../packages/contracts/src/BondingCurve.sol",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../app/security/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(curve, /TRADE_FEE_BPS\s*=\s*100;/);
  for (const domain of [
    "bnbx.meme",
    "bnbx.sh",
    "bnbx.fun",
    "bnbx.dev",
    "bnbx.app",
  ]) {
    assert.match(page, new RegExp(`"${domain.replace(".", "\\.")}"`));
  }
  for (const language of languages) {
    const rows = securityCopy[language].feeItems.slice(1, 3);
    for (const [, value] of rows) {
      assert.equal(value, "1%");
    }
  }
});

test("separates the three active factories from read-only historical factories", () => {
  const labels = {
    standard: "Standard",
    holderRewards: "Holder rewards",
    lpRewards: "LP rewards",
    legacyStandard: "Legacy standard",
    autoLiquidity: "Legacy auto-liquidity",
    legacyRewards: "Legacy rewards",
    router: "Router",
    burnAddress: "Burn address",
  };
  const addresses = {
    standard: "0x26f43d62e1cfadc3d89ff0ffe58375ecbded7330",
    holderRewards: "0x31ce11e80875e1d698089f71f06acbb27726db95",
    lpRewards: "0xa887212925aaa9dee93c1379f7a8119384cf9157",
    legacyStandard: "0xdb189396ae2a350c484ddd749a6af96baebc124b",
    autoLiquidity: "0x9f572dc9d582ec8347d2a803f766652982220539",
    rewards: "0x28100dbfa3f1a3d563e1667259433adfa3aac4bb",
    legacyRewards: "0xde844f36a3bab42ae23158de5c3e8f0ac31e6af8",
    router: "0x10ed43c718714eb63d5aa57b78b54704e256024e",
    burnAddress: "0x000000000000000000000000000000000000dead",
  };

  const groups = buildSecurityAddressGroups(labels, addresses);

  assert.deepEqual(
    groups.activeFactories.map(({ label, address }) => [label, address]),
    [
      [labels.standard, addresses.standard],
      [labels.holderRewards, addresses.holderRewards],
      [labels.lpRewards, addresses.lpRewards],
    ],
  );
  assert.ok(
    groups.historicalFactories.some(
      ({ address }) => address === addresses.rewards,
    ),
  );
  assert.ok(
    groups.historicalFactories.every(
      ({ address }) =>
        !groups.activeFactories.some(
          ({ address: activeAddress }) => activeAddress === address,
        ),
    ),
  );
});
