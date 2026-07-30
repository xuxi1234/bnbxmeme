import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  accessibilityCopy,
  adminCopy,
  advancedTokenCopy,
  createCopy,
  deploymentCopy,
  interpolate,
  localizeCreateErrorMessage,
  localeByLanguage,
} from "./localization-copy.ts";

const languages = ["zh", "en", "ko", "ja"];

function shape(value) {
  if (typeof value === "string") return "string";
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, shape(nested)]),
  );
}

test("keeps every localized surface structurally complete in four languages", () => {
  for (const dictionary of [
    accessibilityCopy,
    adminCopy,
    advancedTokenCopy,
    createCopy,
    deploymentCopy,
  ]) {
    assert.deepEqual(Object.keys(dictionary).sort(), [...languages].sort());
    const expected = shape(dictionary.zh);
    for (const language of languages) {
      assert.deepEqual(shape(dictionary[language]), expected);
    }
  }
  assert.deepEqual(Object.keys(localeByLanguage).sort(), [...languages].sort());
});

test("keeps every localized field non-empty", () => {
  function visit(value) {
    if (typeof value === "string") {
      assert.notEqual(value.trim(), "");
      return;
    }
    Object.values(value).forEach(visit);
  }
  [
    accessibilityCopy,
    adminCopy,
    advancedTokenCopy,
    createCopy,
    deploymentCopy,
  ].forEach(visit);
});

test("keeps empty, unavailable, and 404 states present in all four languages", async () => {
  const source = await readFile(
    new URL("../components/language-provider.tsx", import.meta.url),
    "utf8",
  );
  const requiredKeys = [
    "noMatch",
    "noTrades",
    "noHolders",
    "noProjectsYet",
    "noProjectsHelp",
    "pageNotFoundTitle",
    "pageNotFoundHelp",
    "projectNotFoundTitle",
    "projectNotFoundHelp",
    "projectUnavailableTitle",
    "projectUnavailableHelp",
    "returnMarket",
    "retryNow",
  ];
  for (const key of requiredKeys) {
    const occurrences = source.match(new RegExp(`\\b${key}:`, "g")) ?? [];
    assert.equal(occurrences.length, languages.length, key);
  }
});

test("keeps the shared message catalog field-complete in all four languages", async () => {
  const source = await readFile(
    new URL("../components/language-provider.tsx", import.meta.url),
    "utf8",
  );
  const keysByLanguage = Object.fromEntries(
    languages.map((language) => {
      const block = source.match(
        new RegExp(`  ${language}: \\{([\\s\\S]*?)\\n  \\},`),
      )?.[1];
      assert.ok(block, language);
      const keys = [...block.matchAll(/\b([A-Za-z]\w*):\s*"/g)]
        .map((match) => match[1])
        .sort();
      return [language, keys];
    }),
  );
  for (const language of languages) {
    assert.deepEqual(keysByLanguage[language], keysByLanguage.zh);
  }
});

test("localizes client and metadata-service validation errors", () => {
  const messages = [
    "社区链接格式无效",
    "QQ群只能填写 5–12 位数字群号",
    "图片不能超过 2MB",
    "代币资料上传失败",
    "所选模板主网 Factory 尚未配置",
  ];
  for (const language of ["en", "ko", "ja"]) {
    for (const message of messages) {
      const localized = localizeCreateErrorMessage(message, language);
      assert.notEqual(localized, message);
    }
  }
});

test("interpolates localized dynamic labels", () => {
  assert.equal(
    interpolate(adminCopy.en.commentsSummary, {
      shown: 3,
      total: 8,
      hidden: 1,
    }),
    "Showing 3 recent / 8 total · 1 hidden",
  );
  assert.equal(
    interpolate(accessibilityCopy.ja.bannerSlide, { index: 2 }),
    "バナー 2 に移動",
  );
});

test("removes Chinese-only copy from admin, deployment, and advanced-token surfaces", async () => {
  const sources = await Promise.all([
    readFile(new URL("../app/admin/moderation/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/deploy-testnet/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../app/token/[address]/token-trading-page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../components/bonding-curve-chart.tsx", import.meta.url), "utf8"),
  ]);
  for (const source of sources) {
    assert.doesNotMatch(source, /[\u3400-\u9fff]/u);
  }
});

test("uses localized template and accessibility copy at render sites", async () => {
  const [createPage, siteHeader, homeBanner, chart] = await Promise.all([
    readFile(new URL("../app/create/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/site-header.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/home-banner.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../components/bonding-curve-chart.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(createPage, /copy\.templates\[id\]/);
  assert.doesNotMatch(createPage, /name:\s*language === "zh"/);
  assert.doesNotMatch(siteHeader, /aria-label="主导航"/);
  assert.doesNotMatch(homeBanner, /aria-label="上一张横幅"/);
  assert.doesNotMatch(chart, /aria-label="K线周期"/);
});
