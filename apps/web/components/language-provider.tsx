"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Language = "zh" | "en" | "ko" | "ja";
export type Theme = "dark" | "light";

const messages: Record<Language, Record<string, string>> = {
  zh: {
    market: "市场", create: "创建代币", today: "今日毕业", history: "历史毕业",
    projects: "实时项目", hot: "热门", latest: "最新", graduating: "即将打满", graduated: "历史毕业",
    buy: "买入", sell: "卖出", buyWith: "使用 BNB 买入", sellToken: "卖出代币",
    expectedGet: "预计获得", expectedReceive: "预计收到", fee: "交易手续费",
    switchNetwork: "切换到 BNB 主网", firstApproveSell: "首次授权并卖出",
    approving: "等待授权确认…", selling: "等待卖出确认…", balance: "余额",
    progress: "毕业进度", target: "目标", loading: "读取中…", internal: "内盘",
    graduatingState: "毕业中", graduatedState: "已毕业", noMatch: "暂无符合条件的项目",
    risk: "数字资产具有高度风险。请独立研究并谨慎交易。",
    deploy: "部署代币", browse: "浏览内盘", copied: "已复制 ✓", copy: "复制",
    recentTrades: "最近交易", holders: "持币地址", noTrades: "还没有内盘交易。", noHolders: "暂无持币地址。",
    readingLogs: "正在读取链上数据…", items: "条", addresses: "个", theme: "切换黑白模式",
    createTitle: "配置代币", tokenName: "代币名称", tokenSymbol: "代币符号", tokenIntro: "代币简介",
    tokenLogo: "代币 Logo", socialLinks: "社区链接（选填）", graduationTarget: "毕业额度",
    creatorBuy: "创建者首购（选填）", createToken: "创建代币",
    curveTrading: "内盘交易", preparing: "准备毕业", pancake: "PancakeSwap V2",
    myBalance: "我的余额", supply: "固定总供应量", factoryPermission: "Factory 配置权限",
    graduationPermission: "毕业解锁权限", pairStatus: "Pair 转账状态", abandoned: "已放弃",
    destroyed: "已销毁", curveOnly: "仅自动曲线", protected: "毕业前保护中", unlocked: "毕业后已开放",
    confirmed: "交易已确认。", txHash: "交易哈希",
    searchPlaceholder: "输入代币名称、符号或合约地址",
    qqGroupNumber: "QQ群号", qqGroupCopied: "QQ群号已复制，请打开QQ搜索加入",
    qqGroupInvalid: "QQ群号仅允许填写 5–12 位数字",
  },
  en: {
    market: "Market", create: "Create Token", today: "Graduating", history: "Graduated",
    projects: "Live Projects", hot: "Hot", latest: "Latest", graduating: "Graduating", graduated: "Graduated",
    buy: "Buy", sell: "Sell", buyWith: "Buy with BNB", sellToken: "Sell Token",
    expectedGet: "You receive", expectedReceive: "You receive", fee: "Trading fee",
    switchNetwork: "Switch to BNB Mainnet", firstApproveSell: "Approve once & sell",
    approving: "Confirming approval…", selling: "Confirming sale…", balance: "Balance",
    progress: "Graduation progress", target: "Target", loading: "Loading…", internal: "Bonding Curve",
    graduatingState: "Migrating", graduatedState: "Graduated", noMatch: "No matching projects",
    risk: "Digital assets are highly risky. Do your own research and trade carefully.",
    deploy: "Create Token", browse: "Explore Market", copied: "Copied ✓", copy: "Copy",
    recentTrades: "Recent Trades", holders: "Holders", noTrades: "No bonding-curve trades yet.", noHolders: "No holders yet.",
    readingLogs: "Loading on-chain data…", items: "trades", addresses: "holders", theme: "Toggle light or dark mode",
    createTitle: "Configure Token", tokenName: "Token Name", tokenSymbol: "Token Symbol", tokenIntro: "Description",
    tokenLogo: "Token Logo", socialLinks: "Community Links (Optional)", graduationTarget: "Graduation Target",
    creatorBuy: "Creator Initial Buy (Optional)", createToken: "Create Token",
    curveTrading: "Bonding Curve", preparing: "Preparing Graduation", pancake: "PancakeSwap V2",
    myBalance: "My balance", supply: "Fixed total supply", factoryPermission: "Factory permissions",
    graduationPermission: "Graduation authority", pairStatus: "Pair transfer status", abandoned: "Renounced",
    destroyed: "Burned", curveOnly: "Automatic curve only", protected: "Protected before graduation", unlocked: "Unlocked after graduation",
    confirmed: "Transaction confirmed.", txHash: "Transaction hash",
    searchPlaceholder: "Search by token name, symbol, or contract",
    qqGroupNumber: "QQ Group Number", qqGroupCopied: "Group number copied. Search for it in QQ to join.",
    qqGroupInvalid: "Enter a QQ group number containing 5–12 digits.",
  },
  ko: {
    market: "마켓", create: "토큰 생성", today: "졸업 예정", history: "졸업 기록",
    projects: "실시간 프로젝트", hot: "인기", latest: "최신", graduating: "졸업 예정", graduated: "졸업 완료",
    buy: "구매", sell: "판매", buyWith: "BNB로 구매", sellToken: "토큰 판매",
    expectedGet: "예상 수령", expectedReceive: "예상 수령", fee: "거래 수수료",
    switchNetwork: "BNB 메인넷으로 전환", firstApproveSell: "최초 승인 후 판매",
    approving: "승인 확인 중…", selling: "판매 확인 중…", balance: "잔액",
    progress: "졸업 진행률", target: "목표", loading: "불러오는 중…", internal: "본딩 커브",
    graduatingState: "졸업 중", graduatedState: "졸업 완료", noMatch: "조건에 맞는 프로젝트가 없습니다",
    risk: "디지털 자산은 고위험 상품입니다. 직접 조사하고 신중히 거래하세요.",
    deploy: "토큰 생성", browse: "마켓 보기", copied: "복사됨 ✓", copy: "복사",
    recentTrades: "최근 거래", holders: "홀더", noTrades: "아직 본딩 커브 거래가 없습니다.", noHolders: "아직 홀더가 없습니다.",
    readingLogs: "온체인 데이터 불러오는 중…", items: "건", addresses: "명", theme: "라이트/다크 모드 전환",
    createTitle: "토큰 설정", tokenName: "토큰 이름", tokenSymbol: "토큰 심볼", tokenIntro: "토큰 소개",
    tokenLogo: "토큰 로고", socialLinks: "커뮤니티 링크 (선택)", graduationTarget: "졸업 목표",
    creatorBuy: "생성자 최초 구매 (선택)", createToken: "토큰 생성",
    curveTrading: "본딩 커브", preparing: "졸업 준비", pancake: "PancakeSwap V2",
    myBalance: "내 잔액", supply: "고정 총 공급량", factoryPermission: "Factory 권한",
    graduationPermission: "졸업 권한", pairStatus: "Pair 전송 상태", abandoned: "권한 포기",
    destroyed: "소각됨", curveOnly: "자동 커브 전용", protected: "졸업 전 보호", unlocked: "졸업 후 개방",
    confirmed: "거래가 확인되었습니다.", txHash: "거래 해시",
    searchPlaceholder: "토큰 이름, 심볼 또는 컨트랙트 검색",
    qqGroupNumber: "QQ 그룹 번호", qqGroupCopied: "그룹 번호가 복사되었습니다. QQ에서 검색하여 가입하세요。",
    qqGroupInvalid: "5~12자리 숫자로 된 QQ 그룹 번호를 입력하세요.",
  },
  ja: {
    market: "マーケット", create: "トークン作成", today: "卒業予定", history: "卒業履歴",
    projects: "リアルタイム", hot: "人気", latest: "新着", graduating: "卒業間近", graduated: "卒業済み",
    buy: "購入", sell: "売却", buyWith: "BNBで購入", sellToken: "トークンを売却",
    expectedGet: "受取予定", expectedReceive: "受取予定", fee: "取引手数料",
    switchNetwork: "BNBメインネットへ切替", firstApproveSell: "初回承認して売却",
    approving: "承認確認中…", selling: "売却確認中…", balance: "残高",
    progress: "卒業進捗", target: "目標", loading: "読込中…", internal: "ボンディングカーブ",
    graduatingState: "卒業処理中", graduatedState: "卒業済み", noMatch: "該当プロジェクトはありません",
    risk: "デジタル資産には高いリスクがあります。十分に調査し慎重に取引してください。",
    deploy: "トークン作成", browse: "市場を見る", copied: "コピー済み ✓", copy: "コピー",
    recentTrades: "最近の取引", holders: "ホルダー", noTrades: "まだ取引がありません。", noHolders: "ホルダーはいません。",
    readingLogs: "オンチェーンデータを読込中…", items: "件", addresses: "人", theme: "ライト/ダーク切替",
    createTitle: "トークン設定", tokenName: "トークン名", tokenSymbol: "シンボル", tokenIntro: "説明",
    tokenLogo: "トークンロゴ", socialLinks: "コミュニティリンク（任意）", graduationTarget: "卒業目標",
    creatorBuy: "作成者の初回購入（任意）", createToken: "トークン作成",
    curveTrading: "ボンディングカーブ", preparing: "卒業準備", pancake: "PancakeSwap V2",
    myBalance: "残高", supply: "固定総供給量", factoryPermission: "Factory権限",
    graduationPermission: "卒業権限", pairStatus: "Pair送金状態", abandoned: "放棄済み",
    destroyed: "バーン済み", curveOnly: "自動カーブのみ", protected: "卒業前保護", unlocked: "卒業後開放",
    confirmed: "取引が確認されました。", txHash: "取引ハッシュ",
    searchPlaceholder: "トークン名・シンボル・アドレスを検索",
    qqGroupNumber: "QQグループ番号", qqGroupCopied: "グループ番号をコピーしました。QQで検索して参加してください。",
    qqGroupInvalid: "5～12桁の数字でQQグループ番号を入力してください。",
  },
};

const LanguageContext = createContext({
  language: "zh" as Language,
  setLanguage: (language: Language) => { void language; },
  theme: "dark" as Theme,
  toggleTheme: () => {},
  t: (key: string) => messages.zh[key] ?? key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>("zh");
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    const saved = localStorage.getItem("bnbx-language") as Language | null;
    if (saved && messages[saved]) setLanguage(saved);
    const savedTheme = localStorage.getItem("bnbx-theme") as Theme | null;
    if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
  }, []);
  useEffect(() => {
    localStorage.setItem("bnbx-language", language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : language;
  }, [language]);
  useEffect(() => {
    localStorage.setItem("bnbx-theme", theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const value = useMemo(
    () => ({
      language,
      setLanguage,
      theme,
      toggleTheme: () => setTheme((current) => current === "dark" ? "light" : "dark"),
      t: (key: string) => messages[language][key] ?? messages.zh[key] ?? key,
    }),
    [language, theme],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
