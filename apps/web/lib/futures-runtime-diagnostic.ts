const selector = (error: unknown) => {
  let current = error;
  for (let depth = 0; depth < 6; depth += 1) {
    if (!current || typeof current !== "object") return undefined;
    const record = current as Record<string, unknown>;
    const data = record.data;
    if (typeof data === "string" && /^0x[0-9a-fA-F]{8,}$/.test(data))
      return data.slice(0, 10).toLowerCase();
    if (data && typeof data === "object") {
      const nested = (data as Record<string, unknown>).data;
      if (
        typeof nested === "string" &&
        /^0x[0-9a-fA-F]{8,}$/.test(nested)
      )
        return nested.slice(0, 10).toLowerCase();
    }
    current = record.cause;
  }
  return undefined;
};

export function runtimeFailureDiagnostic(error: unknown) {
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    revertSelector: selector(error) ?? null,
  };
}
