"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type UTCTimestamp,
} from "lightweight-charts";
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
type HoverData = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
} | null;

const periods: ReadonlyArray<{ label: string; value: Period }> = [
  { label: "1m", value: 60 },
  { label: "5m", value: 300 },
  { label: "15m", value: 900 },
  { label: "1h", value: 3600 },
  { label: "4h", value: 14400 },
  { label: "1D", value: 86400 },
];

function compact(value: number) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function priceLabel(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "—";
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
    .slice(-240);
}

export function BondingCurveChart({
  curve,
  token,
  pair,
  symbol,
  refreshKey,
}: {
  curve: `0x${string}`;
  token?: `0x${string}`;
  pair?: `0x${string}`;
  symbol: string;
  refreshKey?: `0x${string}`;
}) {
  const { language, t } = useLanguage();
  const chartContainer = useRef<HTMLDivElement>(null);
  const hasPoints = useRef(false);
  const [points, setPoints] = useState<Point[]>([]);
  const [period, setPeriod] = useState<Period>(300);
  const [statusKey, setStatusKey] = useState("chartSyncing");
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverData>(null);

  useEffect(() => {
    if (curve === zeroAddress) return;
    const controller = new AbortController();

    async function load() {
      setLoadError(false);
      if (!hasPoints.current) setStatusKey("chartSyncing");
      try {
        const response = await fetch(
          `/api/chain-data?curve=${curve}${
            token ? `&token=${token}` : ""
          }${pair && pair !== zeroAddress ? `&pair=${pair}` : ""}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("chain data");
        const data = (await response.json()) as {
          trades: Array<{
            tokens: string;
            priceBNB: string;
            timestamp: number;
            bnb: string;
          }>;
          refreshedAt?: string;
        };
        const next = data.trades
          .map((trade): Point | null => {
            const tokenWei = BigInt(trade.tokens);
            const bnbWei = BigInt(trade.priceBNB);
            if (!tokenWei || !bnbWei) return null;
            const tokens = Number(formatEther(tokenWei));
            const bnb = Number(formatEther(bnbWei));
            if (!tokens || !bnb || !Number.isFinite(tokens) || !Number.isFinite(bnb)) {
              return null;
            }
            return {
              timestamp: trade.timestamp,
              price: (bnb / tokens) * 1_000_000,
              volume: Number(formatEther(BigInt(trade.bnb))),
            };
          })
          .filter((point): point is Point => Boolean(point?.timestamp))
          .sort((a, b) => a.timestamp - b.timestamp);
        if (!controller.signal.aborted) {
          hasPoints.current = next.length > 0;
          setPoints(next);
          setRefreshedAt(data.refreshedAt ?? new Date().toISOString());
          setStatusKey(next.length ? "" : "chartEmpty");
        }
      } catch {
        if (!controller.signal.aborted) {
          setLoadError(true);
          if (!hasPoints.current) setStatusKey("chartBusy");
        }
      }
    }

    void load();
    const timer = window.setInterval(load, 15_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [curve, pair, refreshKey, reloadKey, token]);

  const candles = useMemo(() => aggregate(points, period), [period, points]);
  const sparse = points.length > 0 && points.length < 12;
  const latest = candles.at(-1);
  const first = candles[0];
  const change =
    latest && first && first.open > 0
      ? ((latest.close - first.open) / first.open) * 100
      : 0;
  const totalVolume = points.reduce((sum, point) => sum + point.volume, 0);
  const visibleOhlc = hover ?? latest ?? null;

  useEffect(() => {
    const container = chartContainer.current;
    if (!container || points.length === 0) return;

    const chart = createChart(container, {
      autoSize: true,
      height: 420,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8d9788",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: 11,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "rgba(80, 92, 76, .18)" },
        horzLines: { color: "rgba(80, 92, 76, .18)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(243, 186, 47, .55)", labelBackgroundColor: "#44370f" },
        horzLine: { color: "rgba(243, 186, 47, .4)", labelBackgroundColor: "#44370f" },
      },
      rightPriceScale: {
        borderColor: "rgba(80, 92, 76, .35)",
        scaleMargins: { top: 0.1, bottom: 0.27 },
      },
      timeScale: {
        borderColor: "rgba(80, 92, 76, .35)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: sparse ? 22 : 10,
        minBarSpacing: 4,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      localization: {
        locale:
          language === "zh"
            ? "zh-CN"
            : language === "ko"
              ? "ko-KR"
              : language === "ja"
                ? "ja-JP"
                : "en-US",
      },
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    const volumeData: HistogramData<UTCTimestamp>[] = (
      sparse
        ? points
        : candles.map((candle) => ({
            timestamp: candle.timestamp,
            volume: candle.volume,
            price: candle.close,
          }))
    ).map((item, index, items) => ({
      time: item.timestamp as UTCTimestamp,
      value: item.volume,
      color:
        index === 0 || item.price >= items[index - 1].price
          ? "rgba(63, 207, 122, .35)"
          : "rgba(255, 108, 100, .35)",
    }));
    volumeSeries.setData(volumeData);

    if (sparse) {
      const lineSeries = chart.addSeries(LineSeries, {
        color: "#f3ba2f",
        lineWidth: 3,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 5,
        priceLineVisible: true,
        lastValueVisible: true,
        priceFormat: {
          type: "price",
          precision: 8,
          minMove: 0.00000001,
        },
      });
      const lineData: LineData<UTCTimestamp>[] = points.map((point) => ({
        time: point.timestamp as UTCTimestamp,
        value: point.price,
      }));
      lineSeries.setData(lineData);
      chart.subscribeCrosshairMove((parameter) => {
        const item = parameter.seriesData.get(lineSeries);
        if (!item || !("value" in item)) {
          setHover(null);
          return;
        }
        const point = points.find(
          (candidate) => candidate.timestamp === Number(parameter.time),
        );
        setHover({
          open: item.value,
          high: item.value,
          low: item.value,
          close: item.value,
          volume: point?.volume ?? 0,
        });
      });
    } else {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#3fcf7a",
        downColor: "#ff6c64",
        borderVisible: false,
        wickUpColor: "#3fcf7a",
        wickDownColor: "#ff6c64",
        priceLineVisible: true,
        lastValueVisible: true,
        priceFormat: {
          type: "price",
          precision: 8,
          minMove: 0.00000001,
        },
      });
      const candleData: CandlestickData<UTCTimestamp>[] = candles.map(
        (candle) => ({
          time: candle.timestamp as UTCTimestamp,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        }),
      );
      candleSeries.setData(candleData);
      chart.subscribeCrosshairMove((parameter) => {
        const item = parameter.seriesData.get(candleSeries);
        if (!item || !("open" in item)) {
          setHover(null);
          return;
        }
        const candle = candles.find(
          (candidate) => candidate.timestamp === Number(parameter.time),
        );
        setHover({
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          volume: candle?.volume ?? 0,
        });
      });
    }

    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, language, points, sparse]);

  return (
    <section className="curve-chart" aria-label={`${symbol} / BNB K 线`}>
      <div className="chart-heading">
        <div>
          <p className="eyebrow">
            {pair && pair !== zeroAddress
              ? "PANCAKESWAP V2 · ON-CHAIN"
              : "BNBX BONDING CURVE · ON-CHAIN"}
          </p>
          <h2>{symbol} / BNB</h2>
          <small>{t("priceUnit")}</small>
        </div>
        <div className="chart-summary">
          <strong>{priceLabel(latest?.close ?? 0)}</strong>
          <span className={change >= 0 ? "chart-up" : "chart-down"}>
            {change >= 0 ? "+" : ""}
            {change.toFixed(2)}%
          </span>
          <span>
            {t("volume")} {compact(totalVolume)} BNB
          </span>
        </div>
      </div>
      <div className="chart-toolbar" aria-label="K线周期">
        {sparse ? (
          <button className="active" type="button" disabled>
            {t("tradeLine")}
          </button>
        ) : (
          periods.map((item) => (
            <button
              className={period === item.value ? "active" : ""}
              key={item.value}
              type="button"
              onClick={() => setPeriod(item.value)}
            >
              {item.label}
            </button>
          ))
        )}
        <span>
          {refreshedAt
            ? `${t("lastUpdated")} ${new Intl.DateTimeFormat(
                language === "zh"
                  ? "zh-CN"
                  : language === "ko"
                    ? "ko-KR"
                    : language === "ja"
                      ? "ja-JP"
                      : "en-US",
                { hour: "2-digit", minute: "2-digit", second: "2-digit" },
              ).format(new Date(refreshedAt))}`
            : t("loading")}
        </span>
      </div>
      {loadError && points.length > 0 && (
        <div className="data-reliability-banner compact" role="status">
          <span>{t("staleDataNotice")}</span>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)}>
            {t("retry")}
          </button>
        </div>
      )}
      <div className="chart-stage">
        {points.length > 0 ? (
          <div className="professional-chart" ref={chartContainer} />
        ) : (
          <div className="chart-empty">
            <span className="chart-pulse" />
            <strong>{statusKey ? t(statusKey) : ""}</strong>
            <p>{t("chartTruth")}</p>
            {loadError && (
              <button type="button" onClick={() => setReloadKey((value) => value + 1)}>
                {t("retry")}
              </button>
            )}
          </div>
        )}
      </div>
      {visibleOhlc && (
        <div className="chart-ohlc">
          <span>O {priceLabel(visibleOhlc.open)}</span>
          <span>H {priceLabel(visibleOhlc.high)}</span>
          <span>L {priceLabel(visibleOhlc.low)}</span>
          <span>C {priceLabel(visibleOhlc.close)}</span>
          <span>VOL {visibleOhlc.volume.toFixed(4)} BNB</span>
        </div>
      )}
    </section>
  );
}
