export type TemplateId = "standard" | "liquidity" | "holders" | "lp";
export type TaxKey = "burn" | "liquidity" | "marketing" | "rewards";
export type TaxSide = Record<TaxKey, number>;

export const STANDARD_CREATE_GAS_LIMIT = 8_000_000n;
export const ADVANCED_CREATE_GAS_LIMIT = 12_000_000n;
export const DEFAULT_REWARDS_TAX_PERCENT = 1;

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
  burn: 0,
  liquidity: 0,
  marketing: 0,
  rewards: 0,
});

export function advancedTemplateValue(
  template: Exclude<TemplateId, "standard">,
) {
  if (template === "liquidity") return 1;
  if (template === "holders") return 2;
  return 3;
}

export function normalizeTaxesForTemplate(
  template: TemplateId,
  buy: TaxSide,
  sell: TaxSide,
) {
  if (template === "standard") {
    return { buy: emptyTaxSide(), sell: emptyTaxSide() };
  }
  if (template === "liquidity") {
    return {
      buy: { ...buy, rewards: 0 },
      sell: { ...sell, rewards: 0 },
    };
  }
  if (buy.rewards + sell.rewards > 0) {
    return { buy: { ...buy }, sell: { ...sell } };
  }
  return {
    buy: { ...buy, rewards: DEFAULT_REWARDS_TAX_PERCENT },
    sell: { ...sell, rewards: DEFAULT_REWARDS_TAX_PERCENT },
  };
}
