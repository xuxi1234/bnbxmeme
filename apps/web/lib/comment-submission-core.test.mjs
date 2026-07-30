import assert from "node:assert/strict";
import test from "node:test";
import {
  mapCommentSubmissionFailure,
  normalizeCommentSignature,
} from "./comment-submission-core.ts";

test("normalizes hexadecimal signatures before persistence", () => {
  assert.equal(normalizeCommentSignature("0xAaBbCc"), "0xaabbcc");
});

test("maps atomic database rate limits to HTTP 429", () => {
  assert.deepEqual(
    mapCommentSubmissionFailure({
      httpStatus: 400,
      code: "P0001",
      message: "COMMENT_RATE_LIMIT",
    }),
    {
      status: 429,
      error: "Please wait 30 seconds before posting again",
    },
  );
});

test("maps canonical signature replays and unique conflicts to HTTP 409", () => {
  assert.equal(
    mapCommentSubmissionFailure({
      httpStatus: 400,
      code: "P0001",
      message: "COMMENT_SIGNATURE_REPLAY",
    }).status,
    409,
  );
  assert.equal(
    mapCommentSubmissionFailure({
      httpStatus: 409,
      code: "23505",
    }).status,
    409,
  );
});
