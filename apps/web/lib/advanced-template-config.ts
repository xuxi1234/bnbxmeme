export type TemplateId = "standard" | "holders" | "lp";
export type TaxKey = "burn" | "liquidity" | "marketing" | "rewards";
export type TaxSide = Record<TaxKey, string>;

export const STANDARD_CREATE_GAS_LIMIT = 8_000_000n;
export const ADVANCED_CREATE_GAS_LIMIT = 12_000_000n;

function ceilDiv(value: bigint, divisor: bigint) {
  if (value === 0n) return 0n;
  return (value - 1n) / divisor + 1n;
}

export function advancedCreateGasLimit(estimatedGas: bigint) {
  if (estimatedGas <= 0n) {
    throw new Error("Advanced template gas estimate must be positive");
  }
  const withMargin = estimatedGas + ceilDiv(estimatedGas, 8n);
  if (withMargin > ADVANCED_CREATE_GAS_LIMIT) {
    throw new Error("Advanced template gas estimate exceeds the safety limit");
  }
  return withMargin;
}

export const emptyTaxSide = (): TaxSide => ({
  burn: "0",
  liquidity: "0",
  marketing: "0",
  rewards: "0",
});

export function advancedTemplateValue(
  template: Exclude<TemplateId, "standard">,
) {
  return template === "holders" ? 0 : 1;
}

export function normalizeTaxesForTemplate(
  template: TemplateId,
  buy: TaxSide,
  sell: TaxSide,
) {
  if (template === "standard") {
    return { buy: emptyTaxSide(), sell: emptyTaxSide() };
  }
  return { buy: { ...buy }, sell: { ...sell } };
}

export function parseTaxPercent(value: string) {
  const normalized = value.trim();
  if (!/^(?:\d+|\d*\.\d{1,2})$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function parseTaxSide(side: TaxSide) {
  const entries = Object.entries(side).map(([key, value]) => [
    key,
    parseTaxPercent(value),
  ]);
  if (entries.some(([, value]) => value === null)) return null;
  return Object.fromEntries(entries) as Record<TaxKey, number>;
}

export function taxSideToBps(side: TaxSide) {
  const parsed = parseTaxSide(side);
  if (!parsed) throw new Error("Tax fields must be non-negative numbers");
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [
      key,
      Math.round(value * 100),
    ]),
  ) as Record<TaxKey, number>;
}
