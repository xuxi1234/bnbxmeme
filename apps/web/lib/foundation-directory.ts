export const FOUNDATION_MULTISIG_ADDRESS =
  "0x3485534a9b3a2630febe0708d82d94a63fe9d8bd";
export const FOUNDATION_MULTISIG_EXPLORER_URL =
  `https://bscscan.com/address/${FOUNDATION_MULTISIG_ADDRESS}`;
export const SHARE_TOKEN_AMOUNT = 1_000_000;
export const TOTAL_FOUNDATION_SHARES = 500;

export type FoundationShareholder = Readonly<{
  id: string;
  name: string;
  shares: number;
}>;

export const foundationShareholders: readonly FoundationShareholder[] = [
  { id: "001", name: "道兵导师", shares: 1 },
  { id: "002", name: "霏霏老师", shares: 2 },
  { id: "003", name: "王文子不吃香菜", shares: 1 },
  { id: "004", name: "丸子", shares: 1 },
  { id: "005", name: "九紫金仙", shares: 1 },
  { id: "006", name: "平平淡淡才是真", shares: 1 },
  { id: "007", name: "~ &易碎的，心！", shares: 1 },
  { id: "008", name: "z道哥～V体系社区", shares: 1 },
  { id: "009", name: "张先生", shares: 5 },
  { id: "010", name: "七七（在用）", shares: 1 },
  { id: "011", name: "阿志", shares: 1 },
  { id: "012", name: "晚星", shares: 1 },
  { id: "013", name: "空空", shares: 1 },
  { id: "014", name: "李先生", shares: 1 },
  { id: "015", name: "℡独有の回忆℡", shares: 1 },
  { id: "016", name: "步步高老师", shares: 1 },
  { id: "017", name: "成就未来老师", shares: 1 },
  { id: "018", name: "苏林", shares: 1 },
  { id: "019", name: "财神", shares: 1 },
  { id: "020", name: "三年", shares: 1 },
  { id: "021", name: "爱笑的大叔", shares: 1 },
  { id: "022", name: "范总", shares: 10 },
  { id: "023", name: "杨爱华", shares: 1 },
  { id: "024", name: "空白格", shares: 1 },
];

const registeredShares = foundationShareholders.reduce(
  (total, shareholder) => total + shareholder.shares,
  0,
);
const remainingShares = TOTAL_FOUNDATION_SHARES - registeredShares;

export const foundationSummary = {
  registeredShares,
  remainingShares,
  registeredTokenAmount: registeredShares * SHARE_TOKEN_AMOUNT,
  remainingTokenAmount: remainingShares * SHARE_TOKEN_AMOUNT,
  totalTokenAmount: TOTAL_FOUNDATION_SHARES * SHARE_TOKEN_AMOUNT,
  registrationPercent:
    Math.round((registeredShares / TOTAL_FOUNDATION_SHARES) * 1_000) / 10,
} as const;
