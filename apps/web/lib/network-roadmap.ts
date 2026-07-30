import type { Language } from "@/components/language-provider";

export const LIVE_NETWORK = {
  name: "BNB Chain",
  short: "BSC",
  mark: "B",
  color: "#f3ba2f",
} as const;

export const ROADMAP_NETWORKS = [
  { name: "Ethereum", short: "ETH", mark: "◆", color: "#627eea" },
  { name: "Base", short: "BASE", mark: "B", color: "#0052ff" },
  { name: "Arbitrum", short: "ARB", mark: "A", color: "#28a0f0" },
  { name: "Optimism", short: "OP", mark: "O", color: "#ff0420" },
  { name: "Solana", short: "SOL", mark: "S", color: "#14f195" },
  { name: "Polygon", short: "POL", mark: "P", color: "#8247e5" },
  { name: "Avalanche", short: "AVAX", mark: "A", color: "#e84142" },
  { name: "Monad", short: "MON", mark: "M", color: "#836ef9" },
  { name: "Sui", short: "SUI", mark: "S", color: "#6fbcf0" },
  { name: "TON", short: "TON", mark: "T", color: "#0098ea" },
  { name: "X Layer", short: "XL", mark: "X", color: "#ffffff" },
  { name: "Linea", short: "LINEA", mark: "L", color: "#61dfff" },
] as const;

type NetworkRoadmapCopy = {
  eyebrow: string;
  title: string;
  lead: string;
  liveStatus: string;
  liveTitle: string;
  liveHelp: string;
  evaluationTitle: string;
  evaluationHelp: string;
  evaluationStatus: string;
  noTimeline: string;
  backMarket: string;
};

export const networkRoadmapCopy: Record<Language, NetworkRoadmapCopy> = {
  zh: {
    eyebrow: "网络路线图",
    title: "当前只支持 BNB Chain",
    lead: "网络选择器只展示已经可用的链。以下网络处于研究与评估阶段，不能在 BNBX 创建或交易代币。",
    liveStatus: "当前可用",
    liveTitle: "BNB Chain Mainnet",
    liveHelp:
      "创建、联合曲线交易、毕业迁移与合约验证均运行在 BNB Chain Mainnet。",
    evaluationTitle: "研究中的网络",
    evaluationHelp: "这些网络已从选择器移到路线图，避免被误认为已经可用。",
    evaluationStatus: "评估中",
    noTimeline:
      "此页面不是上线承诺。只有完成合约部署、安全验收和真实交易测试后，网络才会进入选择器。",
    backMarket: "返回 BNB 市场",
  },
  en: {
    eyebrow: "Network roadmap",
    title: "BNB Chain is the only supported network",
    lead: "The network selector lists only chains that are live. The networks below are being researched and cannot be used to create or trade tokens on BNBX.",
    liveStatus: "Live now",
    liveTitle: "BNB Chain Mainnet",
    liveHelp:
      "Creation, bonding-curve trading, graduation migration, and contract verification all run on BNB Chain Mainnet.",
    evaluationTitle: "Networks under evaluation",
    evaluationHelp:
      "These networks have moved out of the selector so they cannot be mistaken for available products.",
    evaluationStatus: "Evaluating",
    noTimeline:
      "This page is not a launch commitment. A network enters the selector only after contract deployment, security acceptance, and real transaction testing are complete.",
    backMarket: "Return to the BNB market",
  },
  ko: {
    eyebrow: "네트워크 로드맵",
    title: "현재 BNB Chain만 지원합니다",
    lead: "네트워크 선택기에는 실제로 사용할 수 있는 체인만 표시됩니다. 아래 네트워크는 조사 및 평가 단계이며 BNBX에서 토큰을 생성하거나 거래할 수 없습니다.",
    liveStatus: "현재 지원",
    liveTitle: "BNB Chain Mainnet",
    liveHelp:
      "토큰 생성, 본딩 커브 거래, 졸업 이전 및 컨트랙트 검증은 모두 BNB Chain Mainnet에서 실행됩니다.",
    evaluationTitle: "평가 중인 네트워크",
    evaluationHelp:
      "사용 가능한 네트워크로 오인되지 않도록 아래 항목을 선택기에서 로드맵으로 이동했습니다.",
    evaluationStatus: "평가 중",
    noTimeline:
      "이 페이지는 출시 약속이 아닙니다. 컨트랙트 배포, 보안 검수 및 실제 거래 테스트가 완료된 네트워크만 선택기에 추가됩니다.",
    backMarket: "BNB 마켓으로 돌아가기",
  },
  ja: {
    eyebrow: "ネットワークロードマップ",
    title: "現在対応しているのは BNB Chain のみです",
    lead: "ネットワーク選択には実際に利用できるチェーンだけを表示します。以下は調査・評価段階で、BNBXでトークンの作成や取引はできません。",
    liveStatus: "現在利用可能",
    liveTitle: "BNB Chain Mainnet",
    liveHelp:
      "作成、ボンディングカーブ取引、卒業移行、コントラクト検証はすべてBNB Chain Mainnetで実行されます。",
    evaluationTitle: "評価中のネットワーク",
    evaluationHelp:
      "利用可能と誤認されないよう、これらのネットワークを選択欄からロードマップへ移しました。",
    evaluationStatus: "評価中",
    noTimeline:
      "このページは提供開始の確約ではありません。コントラクト配備、セキュリティ受入、実取引テストを完了したネットワークのみ選択欄に追加します。",
    backMarket: "BNBマーケットへ戻る",
  },
};
