export function tokenPriceUsdt(
  pricePerMillionBnb: number | null | undefined,
  bnbUsdt: number | null | undefined,
) {
  if (
    pricePerMillionBnb == null ||
    bnbUsdt == null ||
    !Number.isFinite(pricePerMillionBnb) ||
    !Number.isFinite(bnbUsdt) ||
    pricePerMillionBnb <= 0 ||
    bnbUsdt <= 0
  ) {
    return null;
  }
  return (pricePerMillionBnb / 1_000_000) * bnbUsdt;
}

export function formatTokenPriceUsdt(
  value: number | null | undefined,
  locale = "en-US",
) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  if (value < 0.000000000000001) return value.toExponential(6);
  if (value < 0.01) {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: 18,
      maximumSignificantDigits: 8,
      useGrouping: false,
    }).format(value);
  }
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: value < 1 ? 8 : 6,
    maximumSignificantDigits: 8,
    useGrouping: false,
  }).format(value);
}

export function chartPricePrecision(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return { precision: 8, minMove: 0.00000001 };
  }
  const precision = Math.min(
    14,
    Math.max(4, -Math.floor(Math.log10(value)) + 5),
  );
  return {
    precision,
    minMove: 10 ** -precision,
  };
}

export function formatExactCount(value: number | null | undefined) {
  if (value == null || !Number.isSafeInteger(value) || value < 0) return "—";
  return String(value);
}
