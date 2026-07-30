export type ChartPoint = {
  timestamp: number;
  price: number;
  volume: number;
};

export type ChartCandle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function chronological(points: ChartPoint[]) {
  return points
    .map((point, order) => ({ point, order }))
    .sort(
      (left, right) =>
        left.point.timestamp - right.point.timestamp ||
        left.order - right.order,
    )
    .map(({ point }) => point);
}

export function aggregateChartPoints(
  points: ChartPoint[],
  period: number,
  limit = 240,
) {
  if (!Number.isFinite(period) || period <= 0) {
    throw new Error("Chart period must be positive");
  }
  const groups = new Map<number, ChartPoint[]>();
  for (const point of chronological(points)) {
    const bucket = Math.floor(point.timestamp / period) * period;
    const items = groups.get(bucket);
    if (items) {
      items.push(point);
    } else {
      groups.set(bucket, [point]);
    }
  }
  return [...groups.entries()]
    .map(([timestamp, items]): ChartCandle => ({
      timestamp,
      open: items[0].price,
      high: Math.max(...items.map((item) => item.price)),
      low: Math.min(...items.map((item) => item.price)),
      close: items.at(-1)!.price,
      volume: items.reduce((sum, item) => sum + item.volume, 0),
    }))
    .slice(-limit);
}

export function coalesceChartPointsByTimestamp(points: ChartPoint[]) {
  const unique = new Map<number, ChartPoint>();
  for (const point of chronological(points)) {
    const current = unique.get(point.timestamp);
    unique.set(point.timestamp, {
      timestamp: point.timestamp,
      price: point.price,
      volume: (current?.volume ?? 0) + point.volume,
    });
  }
  return [...unique.values()];
}

export function initialChartLogicalRange(
  dataCount: number,
  { minimumDataBars = 20, maximumDataBars = 80, rightOffset = 4 } = {},
) {
  if (!Number.isInteger(dataCount) || dataCount <= 0) return null;
  const visibleDataBars = Math.min(
    Math.max(dataCount, minimumDataBars),
    maximumDataBars,
  );
  return {
    from: dataCount - visibleDataBars,
    to: dataCount - 1 + rightOffset,
  };
}
