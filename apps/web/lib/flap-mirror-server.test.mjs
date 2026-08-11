import assert from "node:assert/strict";
import test from "node:test";
import {
  discoverFlapMirrorsWith,
  prepareFlapMirrorMetadataWith,
} from "./flap-mirror-server.ts";

const address = "0x0000000000000000000000000000000000000001";

function response(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function boardRow({
  tokenAddress = address,
  listed = true,
  progress = "100.00",
  createdAt = 1_786_378_375,
  vault = null,
} = {}) {
  return {
    coin: {
      address: tokenAddress,
      name: `Flap Token ${tokenAddress.slice(-2)}`,
      symbol: `FL${tokenAddress.slice(-2)}`,
      image: "bafkreiflaplogo",
    },
    listed,
    progress,
    marketCap: "123456.78",
    volume24h: "9876.54",
    holders: 45,
    liquidity: "4321.09",
    createdAt,
    tax: { hasTax: true, buyTaxBps: 100, sellTaxBps: 300 },
    vault,
  };
}

const safeSecurity = {
  is_open_source: "1",
  is_honeypot: "0",
  cannot_buy: "0",
  cannot_sell_all: "0",
  is_mintable: "0",
  is_blacklisted: "0",
  hidden_owner: "0",
  is_proxy: "0",
  selfdestruct: "0",
  transfer_pausable: "0",
  external_call: "0",
};

test("discovers only plain BSC Flap graduates using the live board boundary", async () => {
  const seen = [];
  const mirrors = await discoverFlapMirrorsWith(async (input, init) => {
    const url = String(input);
    seen.push({ url, init });
    if (url.includes("/v3/board")) {
      return response({
        category: "trending",
        sort: "volume24h_desc",
        nextCursor: null,
        items: [
          boardRow(),
          boardRow({ tokenAddress: "0x0000000000000000000000000000000000000013", listed: false }),
          boardRow({ tokenAddress: "0x0000000000000000000000000000000000000014", progress: "99.99" }),
          boardRow({ tokenAddress: "0x0000000000000000000000000000000000000015", vault: { vaultFactoryCategory: ["stocks"] } }),
          boardRow({ tokenAddress: "not-an-address" }),
        ],
      });
    }
    if (url.includes("api.gopluslabs.io")) {
      return response({ result: { [address]: safeSecurity } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  });

  assert.equal(mirrors.length, 1);
  assert.equal(mirrors[0].sourceAddress, address);
  assert.equal(mirrors[0].eligible, true);
  assert.deepEqual(mirrors[0].reasons, []);
  assert.deepEqual(mirrors[0].warnings, []);
  assert.equal(mirrors[0].marketCapUsd, 123456.78);
  assert.equal(mirrors[0].buyTaxPercent, 1);
  assert.equal(mirrors[0].sellTaxPercent, 3);
  assert.match(seen[0].url, /^https:\/\/bnb\.taxed\.fun\/v3\/board\?/);
  assert.equal(seen[0].init.headers.Origin, "https://flap.sh");
  assert.equal(seen.filter(({ url }) => url.includes("api.gopluslabs.io")).length, 1);
});

test("sorts by source creation time, limits twenty, and keeps security outages selectable", async () => {
  const rows = Array.from({ length: 45 }, (_, index) =>
    boardRow({
      tokenAddress: `0x${(index + 1).toString(16).padStart(40, "0")}`,
      createdAt: 1_786_000_000 + index,
    }),
  );
  let boardPage = 0;
  const mirrors = await discoverFlapMirrorsWith(async (input) => {
    const url = String(input);
    if (url.includes("/v3/board")) {
      const page = boardPage++;
      const start = page * 20;
      return response({
        items: rows.slice(start, start + 20),
        nextCursor: start + 20 < rows.length ? `cursor-${page + 1}` : null,
      });
    }
    if (url.includes("api.gopluslabs.io")) return response({}, { status: 503 });
    throw new Error(`Unexpected URL: ${url}`);
  });

  assert.equal(mirrors.length, 20);
  assert.equal(mirrors[0].sourceAddress, "0x000000000000000000000000000000000000002d");
  assert.equal(mirrors.at(-1).sourceAddress, "0x000000000000000000000000000000000000001a");
  assert.equal(boardPage, 3);
  assert.ok(mirrors.every((mirror) => mirror.eligible));
  assert.ok(mirrors.every((mirror) => mirror.warnings.includes("security-unavailable")));
});

test("paginates past an ineligible first board page before choosing the newest twenty", async () => {
  const older = Array.from({ length: 20 }, (_, index) =>
    boardRow({
      tokenAddress: `0x${(index + 1).toString(16).padStart(40, "0")}`,
      listed: false,
      createdAt: 1_786_000_000 + index,
    }),
  );
  const newer = Array.from({ length: 20 }, (_, index) =>
    boardRow({
      tokenAddress: `0x${(index + 101).toString(16).padStart(40, "0")}`,
      createdAt: 1_787_000_000 + index,
    }),
  );
  let page = 0;
  const mirrors = await discoverFlapMirrorsWith(async (input) => {
    const url = String(input);
    if (url.includes("/v3/board")) {
      page += 1;
      return response({
        items: page === 1 ? older : newer,
        nextCursor: page === 1 ? "next-page" : null,
      });
    }
    if (url.includes("api.gopluslabs.io")) return response({ result: {} });
    throw new Error(`Unexpected URL: ${url}`);
  });

  assert.equal(page, 2);
  assert.equal(mirrors.length, 20);
  assert.equal(mirrors[0].sourceAddress, "0x0000000000000000000000000000000000000078");
  assert.equal(mirrors.at(-1).sourceAddress, "0x0000000000000000000000000000000000000065");
});

test("fails the whole discovery read when the Flap board is unavailable", async () => {
  await assert.rejects(
    discoverFlapMirrorsWith(async () => response({}, { status: 503 })),
    /Flap board request failed: 503/,
  );
});

test("revalidates a graduate and pins Flap-specific mirror attribution", async () => {
  let pinnedMetadata;
  const detail = {
    address,
    name: "Flap Golden Cat",
    symbol: "FGC",
    listed: true,
    progress: "100.00",
    marketCap: "123456.78",
    volume24h: "9876.54",
    holdersCount: 45,
    liquidity: "4321.09",
    createdAt: 1_786_378_375,
    tax: { hasTax: true, buyTaxBps: 100, sellTaxBps: 300 },
    vault: null,
    metadata: {
      image: "ipfs://bafkreiflaplogo",
      description: "The original Flap description",
      website: "https://example.com/project",
      twitter: "https://x.com/flap_project",
      telegram: "https://t.me/flap_project",
    },
  };
  const result = await prepareFlapMirrorMetadataWith(address, {
    fetcher: async (input) => {
      assert.match(String(input), new RegExp(`/v3/coin/${address}`));
      return response(detail);
    },
    pinImage: async (imageUrl) => {
      assert.equal(imageUrl, "https://flap.mypinata.cloud/ipfs/bafkreiflaplogo");
      return "ipfs://pinned-flap-logo";
    },
    pinJson: async (metadata) => {
      pinnedMetadata = metadata;
      return "ipfs://pinned-flap-metadata";
    },
  });

  assert.deepEqual(result, {
    metadataURI: "ipfs://pinned-flap-metadata",
    name: "Flap Golden Cat",
    symbol: "FGC",
    graduationTargetBNB: 1,
  });
  assert.equal(pinnedMetadata.sourcePlatform, "Flap.sh");
  assert.equal(pinnedMetadata.sourceContract, address);
  assert.equal(pinnedMetadata.sourceUrl, `https://flap.sh/bnb/${address}`);
  assert.equal(pinnedMetadata.description, "The original Flap description");
  assert.equal(pinnedMetadata.image, "ipfs://pinned-flap-logo");
  assert.equal(pinnedMetadata.mirrorDisclosure, "社区镜像 / 非原项目官方发行");
  assert.equal(pinnedMetadata.createdBy, "BNBX Flap Mirror");
});

test("rejects preparation when the source is no longer a plain graduate", async () => {
  for (const detail of [
    { ...boardRow(), address, name: "Token", symbol: "TOK", listed: false },
    { ...boardRow(), address, name: "Token", symbol: "TOK", progress: "99.9" },
    { ...boardRow(), address, name: "Token", symbol: "TOK", vault: { vault: address } },
  ]) {
    await assert.rejects(
      prepareFlapMirrorMetadataWith(address, {
        fetcher: async () => response(detail),
        pinImage: async () => "ipfs://should-not-run",
        pinJson: async () => "ipfs://should-not-run",
      }),
      /not an eligible graduated Flap token/,
    );
  }
});
