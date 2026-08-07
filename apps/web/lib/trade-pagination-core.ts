const TRADE_PAGE_SIZE = 20;
const SCROLL_END_THRESHOLD_PX = 16;

export const initialTradeLimit = TRADE_PAGE_SIZE;

export function nextTradeLimit(current: number, total: number) {
  return Math.min(total, current + TRADE_PAGE_SIZE);
}

export function tradeLimitAfterRefresh(
  current: number,
  previousTotal: number,
  nextTotal: number,
  preserveViewport: boolean,
) {
  const added = preserveViewport ? Math.max(0, nextTotal - previousTotal) : 0;
  return Math.min(nextTotal, current + added);
}

export function isTradeScrollEnd(position: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}) {
  return (
    position.scrollHeight - position.scrollTop - position.clientHeight <=
    SCROLL_END_THRESHOLD_PX
  );
}
