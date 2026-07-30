import "server-only";

export type CommentModerationSettings = {
  commentsEnabled: boolean;
  blockedTerms: string[];
  updatedAt: string | null;
  updatedBy: string | null;
};

type CommentModerationSettingsRow = {
  comments_enabled: boolean;
  blocked_terms: string[] | null;
  updated_at: string | null;
  updated_by: string | null;
};

const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecret =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

export function supabaseServiceHeaders() {
  if (!supabaseSecret) return null;
  const headers: Record<string, string> = {
    apikey: supabaseSecret,
    "Content-Type": "application/json",
  };
  if (supabaseSecret.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${supabaseSecret}`;
  }
  return headers;
}

export function supabaseTableEndpoint(table: string) {
  if (!supabaseUrl) return null;
  return new URL(`/rest/v1/${table}`, supabaseUrl);
}

export function supabaseRpcEndpoint(functionName: string) {
  if (!supabaseUrl) return null;
  return new URL(`/rest/v1/rpc/${functionName}`, supabaseUrl);
}

export async function readCommentModerationSettings() {
  const headers = supabaseServiceHeaders();
  const endpoint = supabaseTableEndpoint("comment_moderation_settings");
  if (!headers || !endpoint) return null;
  endpoint.searchParams.set(
    "select",
    "comments_enabled,blocked_terms,updated_at,updated_by",
  );
  endpoint.searchParams.set("id", "eq.1");
  endpoint.searchParams.set("limit", "1");
  const response = await fetch(endpoint, {
    headers,
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return null;
  const rows = (await response.json()) as CommentModerationSettingsRow[];
  const row = rows[0];
  if (!row) return null;
  return {
    commentsEnabled: row.comments_enabled,
    blockedTerms: row.blocked_terms ?? [],
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  } satisfies CommentModerationSettings;
}

export function normalizeModerationText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\p{P}\p{S}\s_]+/gu, "");
}

export function findBlockedTerm(body: string, terms: string[]) {
  const normalizedBody = normalizeModerationText(body);
  return (
    terms.find((term) => {
      const normalizedTerm = normalizeModerationText(term);
      return normalizedTerm.length > 0 && normalizedBody.includes(normalizedTerm);
    }) ?? null
  );
}
