type ChatMessage = {
  role: string;
  content: string;
};

type ChatCompletion = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

export function extractChatContent(result: ChatCompletion) {
  const content = result.choices?.[0]?.message?.content;
  const text = Array.isArray(content)
    ? content
        .filter((part) => part?.type === "text" || typeof part?.text === "string")
        .map((part) => part.text ?? "")
        .join("")
    : (content ?? "");
  return text.trim() || null;
}

export function buildChatCompletionBody(
  model: string,
  messages: ChatMessage[],
  attempt: number,
) {
  return {
    model,
    messages,
    max_completion_tokens: attempt === 0 ? 1800 : 3000,
    reasoning_effort: "minimal" as const,
  };
}

export function readChatErrorCode(result: unknown) {
  if (
    result &&
    typeof result === "object" &&
    "code" in result &&
    typeof result.code === "string"
  )
    return result.code;
  return "request_failed";
}
