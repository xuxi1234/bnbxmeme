import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChatCompletionBody,
  extractChatContent,
  readChatErrorCode,
} from "./bnbx-ai-chat-reliability.ts";

test("extracts text from normal and structured chat completion content", () => {
  assert.equal(
    extractChatContent({ choices: [{ message: { content: "  BNB answer  " } }] }),
    "BNB answer",
  );
  assert.equal(
    extractChatContent({
      choices: [
        {
          message: {
            content: [
              { type: "text", text: "BNB " },
              { type: "text", text: "answer" },
            ],
          },
        },
      ],
    }),
    "BNB answer",
  );
  assert.equal(
    extractChatContent({ choices: [{ message: { content: "   " } }] }),
    null,
  );
});

test("uses minimal reasoning and expands the completion budget on recovery", () => {
  const messages = [{ role: "user", content: "BNB 是什么？" }];
  assert.deepEqual(buildChatCompletionBody("gpt-5-mini", messages, 0), {
    model: "gpt-5-mini",
    messages,
    max_completion_tokens: 1800,
    reasoning_effort: "minimal",
  });
  assert.equal(
    buildChatCompletionBody("gpt-5-mini", messages, 1)
      .max_completion_tokens,
    3000,
  );
});

test("preserves the server error code for an actionable client message", () => {
  assert.equal(readChatErrorCode({ code: "provider_quota" }), "provider_quota");
  assert.equal(readChatErrorCode({ error: "failed" }), "request_failed");
  assert.equal(readChatErrorCode(null), "request_failed");
});
