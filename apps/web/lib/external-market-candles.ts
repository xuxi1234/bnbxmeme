import type { ChartCandle } from "./market-chart-core.ts";

const periodMap = new Map<number, { timeframe: string; aggregate: string }>([
  [60, { timeframe: "minute", aggregate: "1" }],
  [300, { timeframe: "minute", aggregate: "5" }],
  [900, { timeframe: "minute", aggregate: "15" }],
  [3_600, { timeframe: "hour", aggregate: "1" }],
  [14_400, { timeframe: "hour", aggregate: "4" }],
  [86_400, { timeframe: "day", aggregate: "1" }],
]);

export function geckoOhlcvRequest({
  period,
}: {
  pair: string;
  token: string;
  period: number;
}) {
  const request = periodMap.get(period);
  if (!request) throw new Error("Unsupported chart period");
  return request;
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function parseGeckoOhlcv(payload: unknown): ChartCandle[] {
  const rows = (
    payload as {
      data?: { attributes?: { ohlcv_list?: unknown[] } };
    }
  )?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(rows)) return [];

  return rows
    .flatMap((row): ChartCandle[] => {
      if (!Array.isArray(row) || row.length < 6) return [];
      const values = row.slice(0, 6).map(finiteNumber);
      if (values.some((value) => value === null)) return [];
      const [timestamp, open, high, low, close, volume] = values as number[];
      if (timestamp <= 0 || open <= 0 || high <= 0 || low <= 0 || close <= 0) {
        return [];
      }
      return [{ timestamp, open, high, low, close, volume }];
    })
    .sort((left, right) => left.timestamp - right.timestamp);
}
