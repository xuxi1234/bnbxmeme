export type FuturesLanguage = "zh" | "en" | "ko" | "ja";

const zh = {
  title: "BNBX 永续合约",
  testnet: "仅限 BSC 测试网",
  testnetAssetWarning: "测试 BNBX 与测试 USDT 没有真实价值，绝不是主网资产。",
  testBnbx: "测试 BNBX",
  testUsdt: "测试 USDT",
  connect: "连接钱包",
  authenticate: "签名进入测试环境",
  switchChain: "切换到 BSC 测试网",
  refresh: "刷新数据",
  marketOpen: "市场开放",
  closeOnly: "仅可减仓",
  oracleHealthy: "预言机正常",
  oracleStale: "预言机异常",
  keeper: "Keeper 状态",
  collateral: "抵押品",
  amount: "数量",
  deposit: "存入测试 USDT",
  withdraw: "取出测试 USDT",
  approve: "先授权测试 USDT",
  long: "做多",
  short: "做空",
  maker: "Maker · 0% 手续费",
  taker: "Taker · 1% 手续费",
  makerRole: "挂单方",
  takerRole: "吃单方",
  keeperHealthy: "正常",
  keeperDegraded: "降级",
  quantity: "合约数量",
  limitPrice: "限价（测试 USDT）",
  leverage: "杠杆",
  reduceOnly: "仅减仓",
  submitOrder: "签名提交订单",
  openOrders: "当前订单",
  fills: "成交记录",
  positions: "逐仓仓位",
  marginRatio: "保证金率",
  funding: "资金费",
  liquidationPrice: "强平价格",
  entryPrice: "开仓价格",
  markPrice: "标记价格",
  equity: "权益",
  maintenance: "维持保证金",
  cancel: "取消",
  empty: "暂无数据",
  loading: "正在读取测试网数据…",
  signedIn: "测试环境身份已验证",
  riskHealthy: "健康",
  riskWarning: "接近维持保证金",
  riskLiquidation: "可被清算",
  deadline: "订单有效期 20 分钟",
  signing: "请在钱包确认签名…",
  transaction: "请在钱包确认测试网交易…",
  success: "测试网操作已提交。",
  awaitingCounterparty: "等待对手方",
  relayerSubmitting: "自动提交中",
  included: "交易已上链，等待确认",
  confirmed: "成交已确认",
  failed: "提交失败",
  unavailable: "测试网服务暂时不可用。",
  chain97: "Chain ID 97",
  feeNotice: "Maker 0%；Taker 按成交名义价值收取 1%。最高 3× 杠杆。",
};

type Copy = typeof zh;

export const FUTURES_COPY: Record<FuturesLanguage, Copy> = {
  zh,
  en: {
    title: "BNBX Perpetual Futures",
    testnet: "BSC Testnet only",
    testnetAssetWarning:
      "Test BNBX and Test USDT have no real value and are not mainnet assets.",
    testBnbx: "Test BNBX",
    testUsdt: "Test USDT",
    connect: "Connect wallet",
    authenticate: "Sign in to test environment",
    switchChain: "Switch to BSC Testnet",
    refresh: "Refresh data",
    marketOpen: "Market open",
    closeOnly: "Close only",
    oracleHealthy: "Oracle healthy",
    oracleStale: "Oracle degraded",
    keeper: "Keeper health",
    collateral: "Collateral",
    amount: "Amount",
    deposit: "Deposit Test USDT",
    withdraw: "Withdraw Test USDT",
    approve: "Approve Test USDT first",
    long: "Long",
    short: "Short",
    maker: "Maker · 0% fee",
    taker: "Taker · 1% fee",
    makerRole: "Maker",
    takerRole: "Taker",
    keeperHealthy: "Healthy",
    keeperDegraded: "Degraded",
    quantity: "Contract quantity",
    limitPrice: "Limit price (Test USDT)",
    leverage: "Leverage",
    reduceOnly: "Reduce only",
    submitOrder: "Sign and submit order",
    openOrders: "Open orders",
    fills: "Fills",
    positions: "Isolated positions",
    marginRatio: "Margin ratio",
    funding: "Funding",
    liquidationPrice: "Liquidation price",
    entryPrice: "Entry price",
    markPrice: "Mark price",
    equity: "Equity",
    maintenance: "Maintenance margin",
    cancel: "Cancel",
    empty: "No data",
    loading: "Loading testnet data…",
    signedIn: "Test environment authenticated",
    riskHealthy: "Healthy",
    riskWarning: "Near maintenance margin",
    riskLiquidation: "Liquidatable",
    deadline: "Order expires in 20 minutes",
    signing: "Confirm the signature in your wallet…",
    transaction: "Confirm the testnet transaction in your wallet…",
    success: "Testnet action submitted.",
    awaitingCounterparty: "Awaiting counterparty",
    relayerSubmitting: "Relayer submitting",
    included: "Included, awaiting confirmation",
    confirmed: "Fill confirmed",
    failed: "Submission failed",
    unavailable: "The testnet service is temporarily unavailable.",
    chain97: "Chain ID 97",
    feeNotice: "Maker 0%; Taker 1% of filled notional. Maximum leverage is 3×.",
  },
  ko: {
    title: "BNBX 무기한 선물",
    testnet: "BSC 테스트넷 전용",
    testnetAssetWarning:
      "테스트 BNBX와 테스트 USDT는 실제 가치가 없으며 메인넷 자산이 아닙니다.",
    testBnbx: "테스트 BNBX",
    testUsdt: "테스트 USDT",
    connect: "지갑 연결",
    authenticate: "테스트 환경 서명 로그인",
    switchChain: "BSC 테스트넷으로 전환",
    refresh: "데이터 새로고침",
    marketOpen: "시장 열림",
    closeOnly: "포지션 감소 전용",
    oracleHealthy: "오라클 정상",
    oracleStale: "오라클 이상",
    keeper: "Keeper 상태",
    collateral: "담보",
    amount: "수량",
    deposit: "테스트 USDT 입금",
    withdraw: "테스트 USDT 출금",
    approve: "테스트 USDT 먼저 승인",
    long: "롱",
    short: "숏",
    maker: "Maker · 수수료 0%",
    taker: "Taker · 수수료 1%",
    makerRole: "메이커",
    takerRole: "테이커",
    keeperHealthy: "정상",
    keeperDegraded: "저하",
    quantity: "계약 수량",
    limitPrice: "지정가(테스트 USDT)",
    leverage: "레버리지",
    reduceOnly: "감소 전용",
    submitOrder: "주문 서명 및 제출",
    openOrders: "미체결 주문",
    fills: "체결 내역",
    positions: "격리 포지션",
    marginRatio: "마진 비율",
    funding: "펀딩",
    liquidationPrice: "청산 가격",
    entryPrice: "진입 가격",
    markPrice: "표시 가격",
    equity: "자산",
    maintenance: "유지 마진",
    cancel: "취소",
    empty: "데이터 없음",
    loading: "테스트넷 데이터 로드 중…",
    signedIn: "테스트 환경 인증 완료",
    riskHealthy: "건전",
    riskWarning: "유지 마진 근접",
    riskLiquidation: "청산 가능",
    deadline: "주문 유효 시간 20분",
    signing: "지갑에서 서명을 확인하세요…",
    transaction: "지갑에서 테스트넷 거래를 확인하세요…",
    success: "테스트넷 작업이 제출되었습니다.",
    awaitingCounterparty: "상대 주문 대기 중",
    relayerSubmitting: "자동 제출 중",
    included: "온체인 포함, 확인 대기 중",
    confirmed: "체결 확인 완료",
    failed: "제출 실패",
    unavailable: "테스트넷 서비스를 일시적으로 사용할 수 없습니다.",
    chain97: "Chain ID 97",
    feeNotice: "Maker 0%, Taker 체결 명목가의 1%. 최대 레버리지는 3×입니다.",
  },
  ja: {
    title: "BNBX 無期限先物",
    testnet: "BSC テストネット限定",
    testnetAssetWarning:
      "テスト BNBX とテスト USDT に実価値はなく、メインネット資産ではありません。",
    testBnbx: "テスト BNBX",
    testUsdt: "テスト USDT",
    connect: "ウォレット接続",
    authenticate: "テスト環境に署名ログイン",
    switchChain: "BSC テストネットへ切替",
    refresh: "データ更新",
    marketOpen: "市場オープン",
    closeOnly: "決済のみ",
    oracleHealthy: "オラクル正常",
    oracleStale: "オラクル異常",
    keeper: "Keeper 状態",
    collateral: "証拠金",
    amount: "数量",
    deposit: "テスト USDT を入金",
    withdraw: "テスト USDT を出金",
    approve: "先にテスト USDT を承認",
    long: "ロング",
    short: "ショート",
    maker: "Maker・手数料 0%",
    taker: "Taker・手数料 1%",
    makerRole: "メイカー",
    takerRole: "テイカー",
    keeperHealthy: "正常",
    keeperDegraded: "低下",
    quantity: "契約数量",
    limitPrice: "指値（テスト USDT）",
    leverage: "レバレッジ",
    reduceOnly: "決済のみ",
    submitOrder: "署名して注文送信",
    openOrders: "未約定注文",
    fills: "約定履歴",
    positions: "分離ポジション",
    marginRatio: "証拠金率",
    funding: "資金調達",
    liquidationPrice: "清算価格",
    entryPrice: "参入価格",
    markPrice: "マーク価格",
    equity: "資産",
    maintenance: "維持証拠金",
    cancel: "取消",
    empty: "データなし",
    loading: "テストネットデータを読込中…",
    signedIn: "テスト環境の認証済み",
    riskHealthy: "健全",
    riskWarning: "維持証拠金に接近",
    riskLiquidation: "清算可能",
    deadline: "注文有効期限 20 分",
    signing: "ウォレットで署名を確認してください…",
    transaction: "ウォレットでテストネット取引を確認してください…",
    success: "テストネット操作を送信しました。",
    awaitingCounterparty: "相手注文を待機中",
    relayerSubmitting: "自動送信中",
    included: "取引取込済み・確認待ち",
    confirmed: "約定確認済み",
    failed: "送信失敗",
    unavailable: "テストネットサービスは一時的に利用できません。",
    chain97: "Chain ID 97",
    feeNotice: "Maker 0%、Taker は約定想定元本の 1%。最大レバレッジは 3×です。",
  },
};

const atomic = (value: string, decimals = 18) => {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value))
    throw new Error("invalid decimal");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error("too many decimals");
  const result =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt((fraction + "0".repeat(decimals)).slice(0, decimals));
  if (result < 1n) throw new Error("amount must be positive");
  return result.toString();
};

export function buildFuturesOrder(input: {
  trader: string;
  side: "long" | "short";
  role: "maker" | "taker";
  quantity: string;
  limitPrice: string;
  leverage: number;
  nonce: number;
  deadline: number;
  reduceOnly: boolean;
}) {
  if (
    !/^0x[0-9a-fA-F]{40}$/.test(input.trader) ||
    ![1, 2, 3].includes(input.leverage) ||
    !Number.isSafeInteger(input.nonce) ||
    input.nonce < 0 ||
    !Number.isSafeInteger(input.deadline) ||
    input.deadline < 1
  )
    throw new Error("invalid order");
  return {
    trader: input.trader,
    side: input.side === "long" ? 0 : 1,
    quantity: atomic(input.quantity),
    limitPrice: atomic(input.limitPrice),
    leverage: input.leverage,
    nonce: `${input.nonce}`,
    deadline: `${input.deadline}`,
    reduceOnly: input.reduceOnly,
    role: input.role === "maker" ? 0 : 1,
  };
}

export function classifyMarginRisk(
  marginRatioBps: string,
  liquidatable: boolean,
) {
  if (liquidatable || !/^(?:0|[1-9]\d*)$/.test(marginRatioBps))
    return "liquidation" as const;
  const value = BigInt(marginRatioBps);
  return value < 2_500n ? ("warning" as const) : ("healthy" as const);
}

export function formatFuturesDecimal(
  value: string | undefined,
  decimals = 18,
  precision = 4,
) {
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d*)$/.test(value))
    return "—";
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(1) : value;
  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals) || "0";
  const fraction = decimals
    ? padded.slice(-decimals).slice(0, precision).replace(/0+$/, "")
    : "";
  const formatted = fraction ? `${whole}.${fraction}` : whole;
  return negative && formatted !== "0" ? `-${formatted}` : formatted;
}
