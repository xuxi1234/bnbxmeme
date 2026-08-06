export type TemplateId = "standard" | "holders" | "lp";
export type TaxKey = "burn" | "liquidity" | "marketing" | "rewards";
export type TaxSide = Record<TaxKey, string>;

export const STANDARD_CREATE_GAS_LIMIT = 8_000_000n;
export const ADVANCED_CREATE_GAS_LIMIT = 12_000_000n;
export const LP_REWARDS_CREATE_GAS_LIMIT = 16_000_000n;
export const DEFAULT_REWARD_TOKEN_ADDRESS =
  "0x55d398326f99059ff775485246999027b3197955";
export const ZERO_REWARD_TOKEN_ADDRESS =
  "0x0000000000000000000000000000000000000000";
export const DEFAULT_HOLDER_MINIMUM_REWARD_BALANCE = "1000000";
export const DEFAULT_LP_MINIMUM_REWARD_BALANCE = "10000";

const TOKEN_DECIMALS = 18;
const ONE_TOKEN = 10n ** BigInt(TOKEN_DECIMALS);
const MINIMUM_HOLDER_REWARD_BALANCE = 1000n * ONE_TOKEN;
const UINT256_MAX = 2n ** 256n - 1n;

function ceilDiv(value: bigint, divisor: bigint) {
  if (value === 0n) return 0n;
  return (value - 1n) / divisor + 1n;
}

export function advancedCreateGasLimit(
  estimatedGas: bigint,
  template: Exclude<TemplateId, "standard">,
) {
  if (estimatedGas <= 0n) {
    throw new Error("Advanced template gas estimate must be positive");
  }
  const withMargin = estimatedGas + ceilDiv(estimatedGas, 8n);
  const safetyLimit =
    template === "lp"
      ? LP_REWARDS_CREATE_GAS_LIMIT
      : ADVANCED_CREATE_GAS_LIMIT;
  if (withMargin > safetyLimit) {
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

export function parseMinimumRewardShare(template: TemplateId, value: string) {
  const normalized = value.trim();
  if (!/^(?:\d+|\d*\.\d{1,18})$/.test(normalized)) return null;

  const [whole = "0", fraction = ""] = normalized.split(".");
  const share =
    BigInt(whole || "0") * ONE_TOKEN +
    BigInt(fraction.padEnd(TOKEN_DECIMALS, "0") || "0");
  if (share > UINT256_MAX) return null;

  const exclusiveMinimum =
    template === "holders" ? MINIMUM_HOLDER_REWARD_BALANCE : 0n;
  return share > exclusiveMinimum ? share : null;
}

export function normalizeTaxesForTemplate(
  template: TemplateId,
  buy: TaxSide,
  sell: TaxSide,
) {
  if (template === "standard") {
    return { buy: emptyTaxSide(), sell: emptyTaxSide() };
  }
  if (template === "holders") {
    return {
      buy: { ...buy, marketing: "0" },
      sell: { ...sell, marketing: "0" },
    };
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

export function holderRewardTokenAddress(value: string) {
  const normalized = value.trim();
  return normalized === "" ? ZERO_REWARD_TOKEN_ADDRESS : normalized;
}

export function holderTaxSideToBps(side: TaxSide) {
  const parsed = taxSideToBps(side);
  return {
    liquidity: parsed.liquidity,
    rewards: parsed.rewards,
    burn: parsed.burn,
  };
}
