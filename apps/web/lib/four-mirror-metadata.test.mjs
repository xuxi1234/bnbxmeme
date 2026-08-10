import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeFourMirrorMetadata,
  shouldShowTokenDescriptionForCreator,
} from "./four-mirror-metadata.ts";

const sourceContract = "0x0000000000000000000000000000000000000012";

test("restores the original Four description from legacy mirror metadata", () => {
  assert.deepEqual(
    normalizeFourMirrorMetadata({
      description:
        `社区镜像 / 非原项目官方发行。原始 Four.meme 合约：${sourceContract}。Original Four project description`,
      mirrorDisclosure: "社区镜像 / 非原项目官方发行",
      sourcePlatform: "Four.meme",
      sourceContract,
      sourceUrl: `https://four.meme/token/${sourceContract}`,
    }),
    {
      description: "Original Four project description",
      mirrorDisclosure: "社区镜像 / 非原项目官方发行",
      sourcePlatform: "Four.meme",
      sourceContract,
      sourceUrl: `https://four.meme/token/${sourceContract}`,
    },
  );
});

test("keeps a clean new mirror description unchanged", () => {
  assert.equal(
    normalizeFourMirrorMetadata({
      description: "Original Four project description",
      mirrorDisclosure: "社区镜像 / 非原项目官方发行",
      sourcePlatform: "Four.meme",
      sourceContract,
    }).description,
    "Original Four project description",
  );
});

test("does not strip ordinary token descriptions that merely mention Four", () => {
  assert.equal(
    normalizeFourMirrorMetadata({
      description: "A community project inspired by Four.meme",
    }).description,
    "A community project inspired by Four.meme",
  );
});

test("hides the token description for launches created by the mirror operator wallet", () => {
  assert.equal(
    shouldShowTokenDescriptionForCreator(
      "0x50ce802bc302ba36cd91d26f4b3aafeb631806d3",
    ),
    false,
  );
  assert.equal(
    shouldShowTokenDescriptionForCreator(
      "0x0000000000000000000000000000000000000012",
    ),
    true,
  );
  assert.equal(shouldShowTokenDescriptionForCreator(undefined), true);
});
