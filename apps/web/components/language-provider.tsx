"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Language = "zh" | "en" | "ko" | "ja";

const messages: Record<Language, Record<string, string>> = {
  zh: {
    market: "市场", create: "创建代币", today: "今日毕业", history: "历史毕业",
    projects: "实时项目", hot: "热门", latest: "最新", graduating: "即将毕业", graduated: "历史毕业",
    buy: "买入", sell: "卖出", buyWith: "使用 BNB 买入", sellToken: "卖出代币",
    expectedGet: "预计获得", expectedReceive: "预计收到", fee: "交易手续费",
    switchNetwork: "切换到 BNB 测试网", firstApproveSell: "首次授权并卖出",
    approving: "等待授权确认…", selling: "等待卖出确认…", balance: "余额",
    progress: "毕业进度", target: "目标", loading: "读取中…", internal: "内盘",
    graduatingState: "毕业中", graduatedState: "已毕业", noMatch: "暂无符合条件的项目",
    risk: "数字资产具有高度风险。请独立研究并谨慎交易。",
    deploy: "部署代币", browse: "浏览内盘", copied: "已复制 ✓", copy: "复制",
  },
  en: {
    market: "Market", create: "Create Token", today: "Graduating", history: "Graduated",
    projects: "Live Projects", hot: "Hot", latest: "Latest", graduating: "Graduating", graduated: "Graduated",
    buy: "Buy", sell: "Sell", buyWith: "Buy with BNB", sellToken: "Sell Token",
    expectedGet: "You receive", expectedReceive: "You receive", fee: "Trading fee",
    switchNetwork: "Switch to BNB Testnet", firstApproveSell: "Approve once & sell",
    approving: "Confirming approval…", selling: "Confirming sale…", balance: "Balance",
    progress: "Graduation progress", target: "Target", loading: "Loading…", internal: "Bonding Curve",
    graduatingState: "Migrating", graduatedState: "Graduated", noMatch: "No matching projects",
    risk: "Digital assets are highly risky. Do your own research and trade carefully.",
    deploy: "Create Token", browse: "Explore Market", copied: "Copied ✓", copy: "Copy",
  },
  ko: {
    market: "마켓", create: "토큰 생성", today: "졸업 예정", history: "졸업 기록",
    projects: "실시간 프로젝트", hot: "인기", latest: "최신", graduating: "졸업 예정", graduated: "졸업 완료",
    buy: "구매", sell: "판매", buyWith: "BNB로 구매", sellToken: "토큰 판매",
    expectedGet: "예상 수령", expectedReceive: "예상 수령", fee: "거래 수수료",
    switchNetwork: "BNB 테스트넷으로 전환", firstApproveSell: "최초 승인 후 판매",
    approving: "승인 확인 중…", selling: "판매 확인 중…", balance: "잔액",
    progress: "졸업 진행률", target: "목표", loading: "불러오는 중…", internal: "본딩 커브",
    graduatingState: "졸업 중", graduatedState: "졸업 완료", noMatch: "조건에 맞는 프로젝트가 없습니다",
    risk: "디지털 자산은 고위험 상품입니다. 직접 조사하고 신중히 거래하세요.",
    deploy: "토큰 생성", browse: "마켓 보기", copied: "복사됨 ✓", copy: "복사",
  },
  ja: {
    market: "マーケット", create: "トークン作成", today: "卒業予定", history: "卒業履歴",
    projects: "リアルタイム", hot: "人気", latest: "新着", graduating: "卒業間近", graduated: "卒業済み",
    buy: "購入", sell: "売却", buyWith: "BNBで購入", sellToken: "トークンを売却",
    expectedGet: "受取予定", expectedReceive: "受取予定", fee: "取引手数料",
    switchNetwork: "BNBテストネットへ切替", firstApproveSell: "初回承認して売却",
    approving: "承認確認中…", selling: "売却確認中…", balance: "残高",
    progress: "卒業進捗", target: "目標", loading: "読込中…", internal: "ボンディングカーブ",
    graduatingState: "卒業処理中", graduatedState: "卒業済み", noMatch: "該当プロジェクトはありません",
    risk: "デジタル資産には高いリスクがあります。十分に調査し慎重に取引してください。",
    deploy: "トークン作成", browse: "市場を見る", copied: "コピー済み ✓", copy: "コピー",
  },
};

const LanguageContext = createContext({
  language: "zh" as Language,
  setLanguage: (_language: Language) => {},
  t: (key: string) => messages.zh[key] ?? key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>("zh");
  useEffect(() => {
    const saved = localStorage.getItem("bnbx-language") as Language | null;
    if (saved && messages[saved]) setLanguage(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem("bnbx-language", language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : language;
  }, [language]);
  const value = useMemo(
    () => ({ language, setLanguage, t: (key: string) => messages[language][key] ?? messages.zh[key] ?? key }),
    [language],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
