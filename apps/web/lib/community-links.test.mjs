import assert from "node:assert/strict";
import test from "node:test";
import {
  getCommunityLinkErrors,
  normalizeCommunityLink,
  validateCommunityLinks,
} from "./community-links.ts";

const emptyLinks = {
  website: "",
  telegram: "",
  twitter: "",
  debox: "",
  qqGroupNumber: "",
};

test("normalizes a public website and rejects a single-label host", () => {
  assert.equal(
    normalizeCommunityLink("bnbx.meme", "website"),
    "https://bnbx.meme/",
  );
  assert.throws(
    () => normalizeCommunityLink("not-a-domain", "website"),
    /HTTPS/,
  );
});

test("returns field-specific website and QQ validation errors", () => {
  const errors = getCommunityLinkErrors({
    ...emptyLinks,
    website: "not-a-domain",
    qqGroupNumber: "12ab",
  });
  assert.match(errors.website, /HTTPS/);
  assert.match(errors.qqGroupNumber, /5–12/);
});

test("marks every field that shares a duplicate normalized link", () => {
  const errors = getCommunityLinkErrors({
    ...emptyLinks,
    website: "https://x.com/bnbx",
    twitter: "https://x.com/bnbx",
  });
  assert.match(errors.website, /不能填写完全相同的链接/);
  assert.match(errors.twitter, /不能填写完全相同的链接/);
});

test("keeps submission normalization and field validation consistent", () => {
  const values = {
    ...emptyLinks,
    website: "bnbx.meme",
    telegram: "@bnbx",
  };
  assert.deepEqual(getCommunityLinkErrors(values), {});
  assert.deepEqual(validateCommunityLinks(values), {
    ...emptyLinks,
    website: "https://bnbx.meme/",
    telegram: "https://t.me/bnbx",
  });
});
