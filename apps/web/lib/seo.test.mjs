import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildCreatorIdentityLabel,
  buildCreatorPageMetadata,
  buildCreatorSeoDescription,
  buildPageMetadata,
  buildSiteMetadata,
  buildTokenIdentityLabel,
  buildTokenPageMetadata,
  buildTokenSeoDescription,
  buildTokenShareImageAlt,
  buildTokenStructuredData,
  seoCopy,
  serializeJsonLd,
  SHARE_IMAGE_ALT,
  SHARE_IMAGE_PATH,
  SITE_URL,
} from "./seo.ts";

test("publishes canonical and complete social metadata", () => {
  const root = buildSiteMetadata();
  const page = buildPageMetadata("/");
  assert.equal(root.metadataBase.toString(), `${SITE_URL}/`);
  assert.equal(page.alternates.canonical, "/");
  assert.equal(page.openGraph.url, "/");
  assert.equal(page.openGraph.title, seoCopy.zh.title);
  assert.equal(page.openGraph.description, seoCopy.zh.description);
  assert.equal(page.openGraph.images[0].url, SHARE_IMAGE_PATH);
  assert.equal(page.openGraph.images[0].width, 1200);
  assert.equal(page.openGraph.images[0].height, 630);
  assert.equal(page.openGraph.images[0].alt, SHARE_IMAGE_ALT);
  assert.equal(page.twitter.card, "summary_large_image");
  assert.equal(page.twitter.images[0].url, SHARE_IMAGE_PATH);
  assert.equal(page.twitter.images[0].alt, SHARE_IMAGE_ALT);
});

test("keeps SEO title and description localized in all four languages", () => {
  for (const language of ["zh", "en", "ko", "ja"]) {
    assert.ok(seoCopy[language].title.trim());
    assert.ok(seoCopy[language].description.trim());
  }
  assert.match(seoCopy.ko.title, /[\uac00-\ud7af]/);
  assert.match(seoCopy.ko.description, /[\uac00-\ud7af]/);
  assert.doesNotMatch(seoCopy.ko.description, /模块化|代币|联合曲线/);
});

test("publishes a bounded token identity in detail-page metadata", () => {
  const metadata = buildTokenPageMetadata(
    "/token/0x1111111111111111111111111111111111111111",
    "BNBX 人生",
    "LIFE",
  );
  assert.equal(metadata.title, "BNBX 人生 (LIFE) — BNBX");
  assert.equal(metadata.openGraph.title, metadata.title);
  assert.equal(metadata.twitter.title, metadata.title);
  assert.match(metadata.description, /BNBX 人生 \(LIFE\)/);
  assert.equal(metadata.openGraph.description, metadata.description);
  assert.equal(metadata.twitter.description, metadata.description);
  assert.notEqual(metadata.description, seoCopy.zh.description);

  const duplicate = buildTokenPageMetadata("/token/example", "BNBX", "bnbx");
  assert.equal(duplicate.title, "BNBX — BNBX");

  const controlled = buildTokenPageMetadata(
    "/token/example",
    `A\u200bB\u202eC`,
    "ABC",
  );
  assert.equal(controlled.title, "A B C (ABC) — BNBX");
  assert.ok(String(controlled.title).length < 100);
});

test("publishes bounded token-specific descriptions in all four languages", () => {
  for (const language of ["zh", "en", "ko", "ja"]) {
    const description = buildTokenSeoDescription("BNBX 人生", "LIFE", language);
    assert.match(description, /BNBX 人生 \(LIFE\)/);
    assert.ok([...description].length <= 160);
    assert.notEqual(description, seoCopy[language].description);
  }

  const bounded = buildTokenSeoDescription(
    "A".repeat(80),
    "B".repeat(40),
    "en",
  );
  assert.equal([...bounded].length, 160);
  assert.match(bounded, /…$/);
  assert.equal(buildTokenSeoDescription("", ""), null);
});

test("reuses the bounded token identity for safe share images", () => {
  assert.equal(
    buildTokenIdentityLabel("BNBX 人生", "LIFE"),
    "BNBX 人生 (LIFE)",
  );
  assert.equal(buildTokenIdentityLabel("BNBX", "bnbx"), "BNBX");
  assert.equal(
    buildTokenIdentityLabel(`A\u200bB\u202eC`, "ABC"),
    "A B C (ABC)",
  );
  assert.equal(buildTokenIdentityLabel("\u200b\u202e", "\u200d"), null);
  assert.equal(
    [...buildTokenIdentityLabel("A".repeat(80), "B".repeat(40))].length,
    71,
  );
  assert.equal(
    buildTokenShareImageAlt("BNBX 人生", "LIFE"),
    "BNBX 人生 (LIFE) — BNB Chain token project on BNBX",
  );
  assert.equal(
    buildTokenShareImageAlt(`A\u200bB\u202eC`, "ABC"),
    "A B C (ABC) — BNB Chain token project on BNBX",
  );
  assert.equal(
    buildTokenShareImageAlt("\u200b\u202e", "\u200d"),
    "BNBX token project on BNB Chain",
  );
});

test("publishes safe token-specific FinancialProduct structured data", () => {
  const token = "0x1111111111111111111111111111111111111111";
  const structuredData = buildTokenStructuredData(
    token,
    `BNBX</script><script>alert("xss")</script>`,
    "LIFE",
  );

  assert.equal(structuredData["@context"], "https://schema.org");
  assert.equal(structuredData["@type"], "FinancialProduct");
  assert.equal(structuredData.url, `${SITE_URL}/token/${token}`);
  assert.equal(structuredData.mainEntityOfPage, structuredData.url);
  assert.equal(structuredData.sameAs, `https://bscscan.com/token/${token}`);
  assert.deepEqual(
    structuredData.identifier.map(({ propertyID, value }) => ({
      propertyID,
      value,
    })),
    [
      { propertyID: "contractAddress", value: token },
      { propertyID: "blockchain", value: "BNB Chain" },
    ],
  );
  assert.equal(structuredData.provider.name, "BNBX");

  const serialized = serializeJsonLd(structuredData);
  assert.doesNotMatch(serialized, /<\/script/i);
  assert.match(serialized, /\\u003c\/script/);
  assert.deepEqual(JSON.parse(serialized), structuredData);
  assert.equal(buildTokenStructuredData(token, "", ""), null);
});

test("publishes localized creator-specific metadata without exposing unsafe input", () => {
  const address = "0x1111111111111111111111111111111111111111";
  const metadata = buildCreatorPageMetadata(`/creator/${address}`, address);

  assert.equal(buildCreatorIdentityLabel(address), "0x1111…1111");
  assert.equal(metadata.title, "创建者 0x1111…1111 — BNBX");
  assert.equal(metadata.openGraph.title, metadata.title);
  assert.equal(metadata.twitter.title, metadata.title);
  assert.match(metadata.description, new RegExp(address));
  assert.equal(metadata.openGraph.description, metadata.description);
  assert.equal(metadata.twitter.description, metadata.description);
  assert.notEqual(metadata.description, seoCopy.zh.description);
  assert.notEqual(
    buildCreatorPageMetadata(
      "/creator/0x2222222222222222222222222222222222222222",
      "0x2222222222222222222222222222222222222222",
    ).title,
    metadata.title,
  );

  for (const language of ["zh", "en", "ko", "ja"]) {
    const description = buildCreatorSeoDescription(address, language);
    assert.match(description, new RegExp(address));
    assert.ok([...description].length <= 160);
    assert.notEqual(description, seoCopy[language].description);
  }

  assert.equal(buildCreatorIdentityLabel("not-an-address"), null);
  assert.equal(buildCreatorSeoDescription("<script>alert(1)</script>"), null);
});

test("wires canonical, localized metadata, share image, and token alt text", async () => {
  const [
    layout,
    home,
    languageMetadata,
    creatorLayout,
    tokenMarket,
    tokenTradingPage,
    tokenRoute,
    tokenLayout,
    openGraphImage,
    tokenOpenGraphImage,
    tokenTwitterImage,
    tokenShareImage,
  ] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../components/language-metadata.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/creator/[address]/layout.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/token-market.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/token/[address]/token-trading-page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/token/[address]/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/token/[address]/layout.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/opengraph-image.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/token/[address]/opengraph-image.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/token/[address]/twitter-image.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("./token-share-image-server.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(layout, /buildSiteMetadata/);
  assert.match(layout, /<LanguageMetadata \/>/);
  assert.match(home, /buildPageMetadata\(\"\/\"\)/);
  assert.match(creatorLayout, /buildCreatorPageMetadata/);
  assert.match(languageMetadata, /buildCreatorSeoTitle/);
  assert.match(languageMetadata, /buildCreatorSeoDescription/);
  assert.match(languageMetadata, /meta\[name="description"\]/);
  assert.match(languageMetadata, /meta\[property="og:description"\]/);
  assert.match(openGraphImage, /width:\s*1200/);
  assert.match(openGraphImage, /height:\s*630/);
  assert.doesNotMatch(tokenMarket, /alt=""/);
  assert.doesNotMatch(tokenTradingPage, /alt=""/);
  assert.match(tokenMarket, /a11y\.tokenLogo/);
  assert.match(tokenTradingPage, /a11y\.tokenLogo/);
  assert.match(tokenLayout, /validateTokenProject/);
  assert.match(tokenLayout, /readTokenIdentity/);
  assert.match(tokenLayout, /buildTokenPageMetadata/);
  assert.match(tokenTradingPage, /buildTokenSeoTitle/);
  assert.match(tokenRoute, /application\/ld\+json/);
  assert.match(tokenRoute, /buildTokenStructuredData/);
  assert.match(tokenRoute, /serializeJsonLd/);
  assert.match(languageMetadata, /pathname\.startsWith\("\/token\/"\)/);
  assert.match(languageMetadata, /if \(tokenPage\) return;/);
  assert.match(tokenOpenGraphImage, /renderTokenShareImage/);
  assert.match(tokenTwitterImage, /renderTokenShareImage/);
  assert.match(tokenOpenGraphImage, /generateImageMetadata/);
  assert.match(tokenTwitterImage, /generateImageMetadata/);
  assert.match(tokenOpenGraphImage, /readTokenShareImageAlt/);
  assert.match(tokenTwitterImage, /readTokenShareImageAlt/);
  assert.match(tokenShareImage, /validateTokenProject/);
  assert.match(tokenShareImage, /project\.status === "valid"/);
  assert.match(tokenShareImage, /readTokenIdentity/);
  assert.match(tokenShareImage, /buildTokenIdentityLabel/);
  assert.match(tokenShareImage, /buildTokenShareImageAlt/);
  assert.match(tokenShareImage, /OFFICIAL FACTORY TOKEN/);
  assert.doesNotMatch(
    tokenShareImage,
    /\b(current price|token price|yield|profit|guaranteed return)\b/i,
  );
});
