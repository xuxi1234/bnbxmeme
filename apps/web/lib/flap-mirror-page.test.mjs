import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("..", import.meta.url));

async function source(path) {
  return readFile(new URL(path, `file://${webRoot}/`), "utf8");
}

test("wires an isolated noindex Flap mirror route and API surface", async () => {
  const [page, layout, client, discoveryRoute, prepareRoute, sessionRoute] = await Promise.all([
    source("../app/flap-mirror-deploy/page.tsx"),
    source("../app/flap-mirror-deploy/layout.tsx"),
    source("../components/flap-mirror-deploy-client.tsx"),
    source("../app/api/flap-mirrors/route.ts"),
    source("../app/api/flap-mirrors/prepare/route.ts"),
    source("../app/api/flap-mirrors/session/route.ts"),
  ]);

  assert.match(page, /FlapMirrorDeployClient/);
  assert.doesNotMatch(page, /BNBX_ADMIN_SIGNING_WALLET|resolveFourMirrorAuthorizedWallets/);
  assert.match(layout, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
  assert.match(client, /\/api\/flap-mirrors/);
  assert.match(client, /\/api\/flap-mirrors\/prepare/);
  assert.match(discoveryRoute, /discoverFlapMirrors/);
  assert.match(prepareRoute, /prepareFlapMirrorMetadata/);
  assert.match(prepareRoute, /requireFlapMirrorSession/);
  assert.match(sessionRoute, /createFlapMirrorChallenge/);
  assert.match(sessionRoute, /establishFlapMirrorSession/);
  assert.match(client, /useSignMessage/);
  assert.match(client, /\/api\/flap-mirrors\/session/);
  assert.match(client, /response\.status === 401/);
  assert.match(client, /ensureOperatorSession\(true\)/);
  assert.doesNotMatch(`${page}${layout}${client}`, /\/api\/four-mirrors|Four\.meme|Four 毕业/);
});

test("exposes Flap graduation, source metrics, taxes, disclosure, and sequential fee flow", async () => {
  const client = await source("../components/flap-mirror-deploy-client.tsx");

  assert.match(client, /社区镜像 \/ 非原项目官方发行/);
  assert.match(client, /Flap 已毕业/);
  assert.match(client, /marketCapUsd/);
  assert.match(client, /volume24hUsd/);
  assert.match(client, /liquidityUsd/);
  assert.match(client, /holderCount/);
  assert.match(client, /buyTaxPercent/);
  assert.match(client, /sellTaxPercent/);
  assert.match(client, /selectedMirrorFeeBNB/);
  assert.match(client, /runSequentialMirrorQueue/);
  assert.match(client, /isSubmittedFlapMirrorTransaction/);
  assert.match(client, /回执状态不确定/);
  assert.match(client, /resolveMirrorDeployBlocker/);
  assert.match(client, /buildFlapMirrorCreateRequest/);
  assert.match(client, /createVanityToken|findVanitySalt/);
  assert.match(client, /任意钱包/);
  assert.doesNotMatch(client, /当前钱包无部署权限|授权钱包/);
  assert.match(client, /创建费合计/);
});

test("keeps signed Flap sessions open to every valid wallet", async () => {
  const auth = await source("../lib/flap-mirror-auth.ts");

  assert.doesNotMatch(
    auth,
    /BNBX_ADMIN_SIGNING_WALLET|resolveAdminSigningWallet|resolveFourMirrorAuthorizedWallets/,
  );
  assert.match(auth, /isAddress\(address\)/);
  assert.match(auth, /Flap mirror wallet must be a valid BSC address/);
});

test("keeps the Flap operator route out of public navigation", async () => {
  const navigationFiles = await Promise.all([
    source("../components/site-header.tsx"),
    source("../components/mobile-nav.tsx").catch(() => ""),
  ]);
  assert.doesNotMatch(navigationFiles.join("\n"), /flap-mirror-deploy/);
});

test("blocks both hidden mirror routes in robots while keeping them out of sitemap", async () => {
  const [robots, sitemap] = await Promise.all([
    source("../app/robots.ts"),
    source("../app/sitemap.ts"),
  ]);
  assert.match(robots, /"\/four-mirror-deploy"/);
  assert.match(robots, /"\/flap-mirror-deploy"/);
  assert.doesNotMatch(sitemap, /four-mirror-deploy|flap-mirror-deploy/);
});
