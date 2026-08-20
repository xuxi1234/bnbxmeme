import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  assertCompileProof,
  assertDeploymentManifest,
  assertSafeTree,
  stableJson,
} from "./futures-tooling.mjs";

const root = resolve(import.meta.dirname, "..");
const compileDirectory = resolve(
  root,
  process.env.FUTURES_COMPILE_DIR ?? ".futures-compile",
);
const deploymentDirectory = resolve(
  root,
  process.env.FUTURES_DEPLOYMENT_DIR ?? ".futures-deployments",
);
const expectedOrder = [
  { contract: "FuturesCollateralMock", source: "test/futures/FuturesCollateralMock.sol" },
  { contract: "OracleTokenMock", source: "test/FuturesOracle.t.sol" },
  { contract: "OracleTokenMock", source: "test/FuturesOracle.t.sol" },
  { contract: "OraclePairMock", source: "test/FuturesOracle.t.sol" },
  { contract: "OracleFeedMock", source: "test/FuturesOracle.t.sol" },
  { contract: "RiskEngine", source: "src/futures/RiskEngine.sol" },
  { contract: "ClearingHouse", source: "src/futures/ClearingHouse.sol" },
  { contract: "FuturesOracle", source: "src/futures/FuturesOracle.sol" },
  { contract: "SafetyController", source: "src/futures/SafetyController.sol" },
  { contract: "OrderBook", source: "src/futures/OrderBook.sol" },
];
const expectedFiles = [
  "00-collateral.json",
  "01-bnbx-token.json",
  "02-wbnb-token.json",
  "03-pair.json",
  "04-feed.json",
  "05-risk-engine.json",
  "06-clearing-house.json",
  "07-oracle.json",
  "08-safety-controller.json",
  "09-order-book.json",
  "manifest.json",
];

assertSafeTree(compileDirectory);
assertSafeTree(deploymentDirectory);
if (
  stableJson(readdirSync(deploymentDirectory).sort()) !==
  stableJson(expectedFiles)
) {
  throw new Error("deployment artifact file set mismatch");
}
const recordedProof = JSON.parse(
  readFileSync(join(compileDirectory, "futures.compile-proof.json"), "utf8"),
);
const recordedManifest = JSON.parse(
  readFileSync(join(deploymentDirectory, "manifest.json"), "utf8"),
);
assertCompileProof(recordedProof);
assertDeploymentManifest(recordedManifest, expectedOrder);
recordedManifest.entries.forEach((entry, index) => {
  const recordedEntry = JSON.parse(
    readFileSync(join(deploymentDirectory, expectedFiles[index]), "utf8"),
  );
  if (stableJson(recordedEntry) !== stableJson(entry)) {
    throw new Error(`deployment entry ${index} diverges from manifest`);
  }
});

const temporary = mkdtempSync(join(tmpdir(), "bnbx-futures-independent-audit-"));
const freshCompile = join(temporary, "compile");
const freshDeployments = join(temporary, "deployments");
try {
  const result = spawnSync(
    process.execPath,
    [resolve(import.meta.dirname, "futures-build.mjs")],
    {
      cwd: root,
      env: {
        ...process.env,
        FUTURES_COMPILE_DIR: freshCompile,
        FUTURES_DEPLOYMENT_DIR: freshDeployments,
      },
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "independent build failed");
  }
  const freshProof = JSON.parse(
    readFileSync(join(freshCompile, "futures.compile-proof.json"), "utf8"),
  );
  const freshManifest = JSON.parse(
    readFileSync(join(freshDeployments, "manifest.json"), "utf8"),
  );
  if (stableJson(recordedProof) !== stableJson(freshProof)) {
    throw new Error("compile proof does not match independent build");
  }
  if (stableJson(recordedManifest) !== stableJson(freshManifest)) {
    throw new Error("deployment manifest does not match independent build");
  }
  expectedFiles.slice(0, 10).forEach((file) => {
    if (
      readFileSync(join(deploymentDirectory, file), "utf8") !==
      readFileSync(join(freshDeployments, file), "utf8")
    ) {
      throw new Error(`${file} does not match independent build`);
    }
  });
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
console.log("PASS independent Futures deployment audit");
