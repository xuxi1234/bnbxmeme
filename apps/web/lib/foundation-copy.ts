import type { Language } from "@/components/language-provider";

export type FoundationCopy = {
  entry: string;
  eyebrow: string;
  title: string;
  lead: string;
  perShare: string;
  totalShares: string;
  registered: string;
  remaining: string;
  progress: string;
  multisig: string;
  multisigType: string;
  copyAddress: string;
  copied: string;
  viewBscScan: string;
  directoryTitle: string;
  directoryHelp: string;
  number: string;
  shareholder: string;
  shares: string;
  tokenAmount: string;
  shareUnit: string;
  notice: string;
};

export const foundationCopy: Record<Language, FoundationCopy> = {
  zh: {
    entry: "BNBX基金会",
    eyebrow: "公开透明 · 社区共建",
    title: "BNBX基金会",
    lead: "按确认顺序公开展示基金会份额登记，让每一份共识清晰可查。",
    perShare: "每份数量",
    totalShares: "总份数",
    registered: "已登记",
    remaining: "剩余",
    progress: "登记进度",
    multisig: "基金会多签地址",
    multisigType: "五签三多签",
    copyAddress: "复制地址",
    copied: "已复制",
    viewBscScan: "在 BscScan 查看",
    directoryTitle: "基金会股东明细",
    directoryHelp: "按原始登记编号排列；1份对应1,000,000 BNBX。",
    number: "编号",
    shareholder: "股东名称",
    shares: "份数",
    tokenAmount: "BNBX数量",
    shareUnit: "份",
    notice: "本页面为BNBX基金会份额登记公示，不构成收益承诺。",
  },
  en: {
    entry: "BNBX Foundation",
    eyebrow: "Transparent · Community Built",
    title: "BNBX Foundation",
    lead: "A clear public directory of confirmed foundation share registrations in their original order.",
    perShare: "Per share",
    totalShares: "Total shares",
    registered: "Registered",
    remaining: "Remaining",
    progress: "Registration",
    multisig: "Foundation multisig",
    multisigType: "3-of-5 multisig",
    copyAddress: "Copy address",
    copied: "Copied",
    viewBscScan: "View on BscScan",
    directoryTitle: "Foundation shareholder directory",
    directoryHelp: "Listed by original registration number; one share equals 1,000,000 BNBX.",
    number: "No.",
    shareholder: "Shareholder",
    shares: "Shares",
    tokenAmount: "BNBX amount",
    shareUnit: "shares",
    notice: "This page is a BNBX Foundation share registry and does not promise returns.",
  },
  ko: {
    entry: "BNBX 재단",
    eyebrow: "투명성 · 커뮤니티 공동 구축",
    title: "BNBX 재단",
    lead: "확인된 재단 지분 등록 내역을 원래 순서대로 투명하게 공개합니다.",
    perShare: "1지분 수량",
    totalShares: "총 지분",
    registered: "등록 완료",
    remaining: "잔여",
    progress: "등록 진행률",
    multisig: "재단 멀티시그 주소",
    multisigType: "5명 중 3명 서명",
    copyAddress: "주소 복사",
    copied: "복사됨",
    viewBscScan: "BscScan에서 보기",
    directoryTitle: "재단 주주 명부",
    directoryHelp: "최초 등록 번호 순서이며, 1지분은 1,000,000 BNBX입니다.",
    number: "번호",
    shareholder: "주주명",
    shares: "지분 수",
    tokenAmount: "BNBX 수량",
    shareUnit: "지분",
    notice: "이 페이지는 BNBX 재단 지분 등록 공시이며 수익을 약속하지 않습니다.",
  },
  ja: {
    entry: "BNBX財団",
    eyebrow: "透明性 · コミュニティ共同構築",
    title: "BNBX財団",
    lead: "確認済みの財団持分登録を、元の順番のまま分かりやすく公開します。",
    perShare: "1持分あたり",
    totalShares: "総持分",
    registered: "登録済み",
    remaining: "残り",
    progress: "登録進捗",
    multisig: "財団マルチシグアドレス",
    multisigType: "5名中3名署名",
    copyAddress: "アドレスをコピー",
    copied: "コピー済み",
    viewBscScan: "BscScanで見る",
    directoryTitle: "財団株主明細",
    directoryHelp: "当初の登録番号順です。1持分は1,000,000 BNBXです。",
    number: "番号",
    shareholder: "株主名",
    shares: "持分数",
    tokenAmount: "BNBX数量",
    shareUnit: "持分",
    notice: "本ページはBNBX財団の持分登録公示であり、収益を約束するものではありません。",
  },
};
