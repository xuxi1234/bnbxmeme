"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEther, zeroAddress } from "viem";
import { useLanguage } from "./language-provider";

type Period = 60 | 300 | 900 | 3600 | 14400 | 86400;
type Point = { timestamp: number; price: number; volume: number };
type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const periods: ReadonlyArray<{ label: string; value: Period }> = [
  { label: "1m", value: 60 },
  { label: "5m", value: 300 },
  { label: "15m", value: 900 },
  { label: "1h", value: 3600 },
  { label: "4h", value: 14400 },
  { label: "1D", value: 86400 },
];

function compact(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

function priceLabel(value: number) {
  if (!Number.isFinite(value) || value === 0) return "0";
  return value < 0.000001 ? value.toExponential(3) : value.toFixed(8);
}

function aggregate(points: Point[], period: Period) {
  const groups = new Map<number, Point[]>();
  for (const point of points) {
    const bucket = Math.floor(point.timestamp / period) * period;
    groups.set(bucket, [...(groups.get(bucket) ?? []), point]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([timestamp, items]): Candle => ({
      timestamp,
      open: items[0].price,
      high: Math.max(...items.map((item) => item.price)),
      low: Math.min(...items.map((item) => item.price)),
      close: items.at(-1)!.price,
      volume: items.reduce((sum, item) => sum + item.volume, 0),
    }))
    .slice(-72);
}

export function BondingCurveChart({
  curve,
  symbol,
  refreshKey,
}: {
  curve: `0x${string}`;
  symbol: string;
  refreshKey?: `0x${string}`;
}) {
  const { t } = useLanguage();
  const [points, setPoints] = useState<Point[]>([]);
  const [period, setPeriod] = useState<Period>(300);
  const [statusKey, setStatusKey] = useState("chartSyncing");

  useEffect(() => {
    if (curve === zeroAddress) return;
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/chain-data?curve=${curve}`);
        if (!response.ok) throw new Error("chain data");
        const data = await response.json() as { trades: Array<{ tokens: string; priceBNB: string; timestamp: number; bnb: string }> };
        const next = data.trades.map((trade): Point | null => {
            const tokenWei = BigInt(trade.tokens);
            const bnbWei = BigInt(trade.priceBNB);
            if (!tokenWei || !bnbWei) return null;
            const tokens = Number(formatEther(tokenWei));
            const bnb = Number(formatEther(bnbWei));
            if (!tokens || !bnb) return null;
            return {
              timestamp: trade.timestamp,
              price: (bnb / tokens) * 1_000_000,
              volume: Number(formatEther(BigInt(trade.bnb))),
            };
          })
          .filter((point): point is Point => Boolean(point?.timestamp))
          .sort((a, b) => a.timestamp - b.timestamp);
        if (!cancelled) {
          setPoints(next);
          setStatusKey(next.length ? "" : "chartEmpty");
        }
      } catch {
        if (!cancelled) setStatusKey("chartBusy");
      }
    }

    void load();
    const timer = window.setInterval(load, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [curve, refreshKey]);

  const candles = useMemo(() => aggregate(points, period), [period, points]);
  const latest = candles.at(-1);
  const first = candles[0];
  const change =
    latest && first && first.open > 0
      ? ((latest.close - first.open) / first.open) * 100
      : 0;
  const totalVolume = candles.reduce((sum, candle) => sum + candle.volume, 0);

  const chart = useMemo(() => {
    if (!candles.length) return null;
    const width = 920;
    const height = 360;
    const priceTop = 30;
    const priceBottom = 275;
    const volumeTop = 292;
    const volumeBottom = 345;
    const min = Math.min(...candles.map((candle) => candle.low));
    const max = Math.max(...candles.map((candle) => candle.high));
    const range = max - min || max * 0.05 || 1;
    const maxVolume = Math.max(...candles.map((candle) => candle.volume), 1);
    const slot = width / candles.length;
    const bodyWidth = Math.max(3, Math.min(10, slot * 0.58));
    const y = (price: number) =>
      priceTop + ((max - price) / range) * (priceBottom - priceTop);
    return { width, height, volumeTop, volumeBottom, maxVolume, slot, bodyWidth, y };
  }, [candles]);

  return (
    <section className="curve-chart" aria-label={`${symbol} / BNB K 线`}>
      <div className="chart-heading">
        <div>
          <p className="eyebrow">BONDING CURVE CHART</p>
          <h2>{symbol} / BNB</h2>
          <small>{t("priceUnit")}</small>
        </div>
        <div className="chart-summary">
          <strong>{priceLabel(latest?.close ?? 0)}</strong>
          <span className={change >= 0 ? "chart-up" : "chart-down"}>
            {change >= 0 ? "+" : ""}{change.toFixed(2)}%
          </span>
          <span>{t("volume")} {compact(totalVolume)} BNB</span>
        </div>
      </div>
      <div className="chart-toolbar" aria-label="K线周期">
        {periods.map((item) => (
          <button
            className={period === item.value ? "active" : ""}
            key={item.value}
            type="button"
            onClick={() => setPeriod(item.value)}
          >
            {item.label}
          </button>
        ))}
        <span>{t("liveRefresh")}</span>
      </div>
      <div className="chart-stage">
        {chart ? (
          <svg
            role="img"
            aria-label={`${symbol} / BNB 成交蜡烛图`}
            viewBox={`0 0 ${chart.width} ${chart.height}`}
          >
            {[0, 1, 2, 3, 4].map((line) => (
              <line
                className="chart-grid-line"
                key={line}
                x1="0"
                x2={chart.width}
                y1={30 + line * 61}
                y2={30 + line * 61}
              />
            ))}
            {candles.map((candle, index) => {
              const x = chart.slot * index + chart.slot / 2;
              const open = chart.y(candle.open);
              const close = chart.y(candle.close);
              const high = chart.y(candle.high);
              const low = chart.y(candle.low);
              const rising = candle.close >= candle.open;
              const bodyY = Math.min(open, close);
              const bodyHeight = Math.max(2, Math.abs(close - open));
              const volumeHeight =
                (candle.volume / chart.maxVolume) *
                (chart.volumeBottom - chart.volumeTop);
              return (
                <g className={rising ? "candle-up" : "candle-down"} key={candle.timestamp}>
                  <line x1={x} x2={x} y1={high} y2={low} />
                  <rect
                    x={x - chart.bodyWidth / 2}
                    y={bodyY}
                    width={chart.bodyWidth}
                    height={bodyHeight}
                  />
                  <rect
                    className="volume-bar"
                    x={x - chart.bodyWidth / 2}
                    y={chart.volumeBottom - volumeHeight}
                    width={chart.bodyWidth}
                    height={volumeHeight}
                  />
                </g>
              );
            })}
          </svg>
        ) : (
          <div className="chart-empty">
            <span className="chart-pulse" />
            <strong>{statusKey ? t(statusKey) : ""}</strong>
            <p>{t("chartTruth")}</p>
          </div>
        )}
      </div>
      {latest && (
        <div className="chart-ohlc">
          <span>开 {priceLabel(latest.open)}</span>
          <span>高 {priceLabel(latest.high)}</span>
          <span>低 {priceLabel(latest.low)}</span>
          <span>收 {priceLabel(latest.close)}</span>
          <span>量 {latest.volume.toFixed(4)} BNB</span>
        </div>
      )}
    </section>
  );
}
