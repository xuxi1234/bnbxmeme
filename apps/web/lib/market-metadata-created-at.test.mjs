import assert from "node:assert/strict";
import test from "node:test";
import {
  metadataGatewayCandidates,
  parseMetadataCreatedAt,
} from "./market-metadata-created-at.ts";

test("builds IPFS gateway candidates for token metadata", () => {
  assert.deepEqual(
    metadataGatewayCandidates("ipfs://ipfs/bafy-test/file.json", "https://custom.example/ipfs/"),
    [
      "https://custom.example/ipfs/bafy-test/file.json",
      "https://gateway.pinata.cloud/ipfs/bafy-test/file.json",
      "https://ipfs.io/ipfs/bafy-test/file.json",
    ],
  );
});

test("rejects unsupported metadata locations", () => {
  assert.deepEqual(metadataGatewayCandidates("http://unsafe.example/a.json"), []);
});

test("accepts only valid metadata creation timestamps", () => {
  assert.equal(
    parseMetadataCreatedAt({ createdAt: "2026-08-16T12:19:46.523Z" }),
    Date.parse("2026-08-16T12:19:46.523Z"),
  );
  assert.equal(parseMetadataCreatedAt({ createdAt: "not-a-date" }), null);
  assert.equal(parseMetadataCreatedAt(null), null);
});
