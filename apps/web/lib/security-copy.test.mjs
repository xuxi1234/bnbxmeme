import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  announcementCopy,
  resolveSecurityCopy,
  securityCopy,
} from "./security-copy.ts";
import { MAX_TEMPLATE_SIDE_TAX_PERCENT } from "./template-rules.ts";

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
    zh: /更高的收益|首选平台/,
    en: /greater potential|first choice/i,
    ko: /더 높은 잠재력|선택하세요/,
    ja: /高い可能性|発行するならBNBX/,
  };

  for (const language of languages) {
    assert.doesNotMatch(announcementCopy[language], prohibited[language]);
  }
});

test("keeps security disclosures complete in all four languages", () => {
  const expected = shape(securityCopy.zh);
  for (const language of languages) {
    const copy = resolveSecurityCopy(
      language,
      MAX_TEMPLATE_SIDE_TAX_PERCENT,
    );
    assert.deepEqual(shape(copy), expected);
    assert.equal(copy.templateItems.length, 4);
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
      "../../../packages/contracts/src/libraries/TemplateConfig.sol",
      import.meta.url,
    ),
    "utf8",
  );
  const rawBasisPoints = source.match(
    /MAX_SIDE_TAX_BPS\s*=\s*([\d_]+);/,
  )?.[1];
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
