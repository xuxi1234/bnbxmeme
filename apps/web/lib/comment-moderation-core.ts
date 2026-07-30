export function normalizeModerationText(value: string) {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[\p{C}\p{M}\p{P}\p{S}\p{Z}\s_]+/gu, "");
}

export function findBlockedTerm(body: string, terms: string[]) {
  const normalizedBody = normalizeModerationText(body);
  return (
    terms.find((term) => {
      const normalizedTerm = normalizeModerationText(term);
      return (
        normalizedTerm.length > 0 && normalizedBody.includes(normalizedTerm)
      );
    }) ?? null
  );
}
