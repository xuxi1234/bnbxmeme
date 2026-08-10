import assert from "node:assert/strict";
import test from "node:test";
import {
  discoverFourMirrorsWith,
  prepareFourMirrorMetadataWith,
} from "./four-mirror-server.ts";

const address = "0x0000000000000000000000000000000000000012";

function response(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

const searchToken = {
  tokenAddress: address,
  name: "Panda AI Companion",
  shortName: "PANDA",
  img: "/market/panda.png",
  status: "TRADE",
  createDate: "1786258358000",
};

const detail = {
  address,
  image: "https://static.four.meme/market/panda.png",
  name: "Panda AI Companion",
  shortName: "PANDA",
  descr: "Original Four project description",
  telegramUrl: "https://t.me/panda",
  twitterUrl: "https://x.com/panda",
  status: "TRADE",
  createDate: "1786258358000",
};

const safeSecurity = {
  holder_count: "180",
  is_open_source: "1",
  is_honeypot: "0",
  is_mintable: "0",
  is_blacklisted: "0",
  cannot_buy: "0",
  cannot_sell_all: "0",
  hidden_owner: "0",
  is_proxy: "0",
  selfdestruct: "0",
  transfer_pausable: "0",
  external_call: "0",
};

function createFetcher({ security = safeSecurity } = {}) {
  return async (input, init) => {
    const url = String(input);
    if (url.endsWith("/public/token/search")) {
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        type: "NEW",
        listType: "NOR_DEX",
        pageIndex: 1,
        pageSize: 30,
        status: "TRADE",
        sort: "DESC",
      });
      return response({ code: 0, data: [searchToken] });
    }
    if (url.includes("/private/token/get/v2")) {
      return response({ code: 0, data: detail });
    }
    if (url.includes("api.dexscreener.com")) {
      return response({
        pairs: [
          {
            chainId: "bsc",
            dexId: "pancakeswap",
            pairAddress: "0x1111111111111111111111111111111111111111",
            url: "https://dexscreener.com/bsc/panda",
            baseToken: { address },
            liquidity: { usd: 25_000 },
            volume: { h24: 50_000 },
          },
        ],
      });
    }
    if (url.includes("api.gopluslabs.io")) {
      return response({ result: { [address]: security } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
}

test("discovers and enriches a Four graduate using live boundary shapes", async () => {
  const mirrors = await discoverFourMirrorsWith(createFetcher());
  assert.equal(mirrors.length, 1);
  assert.deepEqual(mirrors[0], {
    sourceAddress: address,
    name: "Panda AI Companion",
    symbol: "PANDA",
    imageUrl: "https://static.four.meme/market/panda.png",
    sourceUrl: `https://four.meme/token/${address}`,
    createdAt: "2026-08-09T06:52:38.000Z",
    description: "Original Four project description",
    telegram: "https://t.me/panda",
    twitter: "https://x.com/panda",
    graduationTargetBNB: 1,
    liquidityUsd: 25_000,
    volume24hUsd: 50_000,
    holderCount: 180,
    pairUrl: "https://dexscreener.com/bsc/panda",
    eligible: true,
    reasons: [],
    warnings: [],
  });
});

test("keeps a graduate selectable when risk data is unavailable", async () => {
  const fetcher = createFetcher();
  const mirrors = await discoverFourMirrorsWith(async (input, init) => {
    if (String(input).includes("api.gopluslabs.io")) {
      throw new Error("risk provider unavailable");
    }
    return fetcher(input, init);
  });
  assert.equal(mirrors[0].eligible, true);
  assert.deepEqual(mirrors[0].reasons, []);
  assert.ok(mirrors[0].warnings.includes("security-unavailable"));
});

test("batches market data and checks qualifying token risks individually", async () => {
  const secondAddress = "0x0000000000000000000000000000000000000013";
  let dexCalls = 0;
  let securityCalls = 0;
  const fetcher = async (input) => {
    const url = String(input);
    if (url.endsWith("/public/token/search")) {
      return response({
        data: [
          searchToken,
          { ...searchToken, tokenAddress: secondAddress, shortName: "BEAR" },
        ],
      });
    }
    if (url.includes("/private/token/get/v2")) {
      const requested = new URL(url).searchParams.get("address");
      return response({
        data: {
          ...detail,
          address: requested,
          shortName: requested === address ? "PANDA" : "BEAR",
        },
      });
    }
    if (url.includes("api.dexscreener.com")) {
      dexCalls += 1;
      assert.match(url, new RegExp(`${address},${secondAddress}$`));
      return response({
        pairs: [address, secondAddress].map((tokenAddress) => ({
          chainId: "bsc",
          dexId: "pancakeswap",
          baseToken: { address: tokenAddress },
          liquidity: { usd: 30_000 },
          volume: { h24: 40_000 },
        })),
      });
    }
    if (url.includes("api.gopluslabs.io")) {
      securityCalls += 1;
      const requested = new URL(url).searchParams.get("contract_addresses");
      assert.ok(requested === address || requested === secondAddress);
      return response({
        result: {
          [requested]: safeSecurity,
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const mirrors = await discoverFourMirrorsWith(fetcher);
  assert.equal(mirrors.length, 2);
  assert.equal(dexCalls, 1);
  assert.equal(securityCalls, 2);
  assert.equal(mirrors.every((mirror) => mirror.eligible), true);
});

test("pins the original Four description separately from mirror disclosure", async () => {
  let pinnedMetadata;
  const result = await prepareFourMirrorMetadataWith(address, {
    fetcher: createFetcher(),
    pinImage: async (imageUrl) => {
      assert.equal(imageUrl, detail.image);
      return "ipfs://mirror-logo";
    },
    pinJson: async (metadata) => {
      pinnedMetadata = metadata;
      return "ipfs://mirror-metadata";
    },
  });

  assert.equal(result.metadataURI, "ipfs://mirror-metadata");
  assert.equal(result.graduationTargetBNB, 1);
  assert.equal(pinnedMetadata.image, "ipfs://mirror-logo");
  assert.equal(pinnedMetadata.sourceContract, address);
  assert.equal(pinnedMetadata.sourcePlatform, "Four.meme");
  assert.equal(pinnedMetadata.description, detail.descr);
  assert.equal(
    pinnedMetadata.mirrorDisclosure,
    "社区镜像 / 非原项目官方发行",
  );
});

test("prepares a fresh zero-tax mirror even when the source contract has warnings", async () => {
  const result = await prepareFourMirrorMetadataWith(address, {
    fetcher: createFetcher({
      security: { ...safeSecurity, is_honeypot: "1" },
    }),
    pinImage: async () => "ipfs://mirror-logo",
    pinJson: async () => "ipfs://mirror-metadata",
  });
  assert.equal(result.metadataURI, "ipfs://mirror-metadata");
});
