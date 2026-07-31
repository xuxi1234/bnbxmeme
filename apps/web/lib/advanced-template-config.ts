export type TemplateId = "standard" | "liquidity" | "holders" | "lp";
export type TaxKey = "burn" | "liquidity" | "marketing" | "rewards";
export type TaxSide = Record<TaxKey, number>;

export const STANDARD_CREATE_GAS_LIMIT = 8_000_000n;
export const ADVANCED_CREATE_GAS_LIMIT = 12_000_000n;
export const DEFAULT_REWARDS_TAX_PERCENT = 1;

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
