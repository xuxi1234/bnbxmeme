"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useLanguage } from "@/components/language-provider";
import styles from "./page.module.css";

const copy = {
  zh: {
    eyebrow: "BNBX AI · 推荐计划 Preview",
    title: "邀请朋友，和小壹一起成长",
    intro:
      "0.1 BNB 永久开通 BNBX AI。会员可分享专属邀请链接，并获得两级推荐收益。",
    locked: "产品预览 · 合约尚未部署，所有交易操作已锁定",
    join: "0.1 BNB 永久开通",
    share: "分享邀请链接",
    copied: "链接已复制",
    members: "会员专属",
    level1: "一级推荐",
    level2: "二级推荐",
    ops: "AI 运营",
    detail: "收益明细",
    withdraw: "提取收益",
    empty: "连接已开通会员的钱包后，将显示真实邀请链接与链上收益。",
    rule: "未开通会员没有邀请权限；无人领取的层级奖励自动归入 AI 运营。",
  },
  en: {
    eyebrow: "BNBX AI · Referral Preview",
    title: "Invite friends. Grow with X-One.",
    intro:
      "Unlock BNBX AI forever for 0.1 BNB. Members can share a personal link and earn two-level referral rewards.",
    locked: "Product Preview · contract not deployed; transactions are locked",
    join: "Unlock forever · 0.1 BNB",
    share: "Share invite link",
    copied: "Link copied",
    members: "Members only",
    level1: "Level 1",
    level2: "Level 2",
    ops: "AI operations",
    detail: "Earnings details",
    withdraw: "Withdraw rewards",
    empty:
      "Connect an active member wallet to see its real invite link and on-chain rewards.",
    rule: "Only members may invite. Unallocated referral levels automatically fund AI operations.",
  },
  ko: {
    eyebrow: "BNBX AI · 추천 프로그램 Preview",
    title: "친구를 초대하고 X-One과 함께 성장하세요",
    intro:
      "0.1 BNB로 BNBX AI를 영구 이용하세요. 회원은 전용 링크와 2단계 추천 보상을 받습니다.",
    locked: "제품 미리보기 · 계약 미배포, 모든 거래 기능 잠김",
    join: "영구 이용 · 0.1 BNB",
    share: "초대 링크 공유",
    copied: "링크 복사 완료",
    members: "회원 전용",
    level1: "1단계 추천",
    level2: "2단계 추천",
    ops: "AI 운영",
    detail: "수익 내역",
    withdraw: "보상 출금",
    empty: "활성 회원 지갑을 연결하면 실제 링크와 온체인 수익이 표시됩니다.",
    rule: "회원만 초대할 수 있으며, 미배정 보상은 AI 운영비로 귀속됩니다.",
  },
  ja: {
    eyebrow: "BNBX AI · 紹介プログラム Preview",
    title: "友だちを招待してX-Oneと成長",
    intro:
      "0.1 BNBでBNBX AIを永久開通。会員は専用リンクと2段階の紹介報酬を受け取れます。",
    locked: "製品プレビュー · コントラクト未展開、取引操作はロック中",
    join: "永久開通 · 0.1 BNB",
    share: "招待リンクを共有",
    copied: "リンクをコピーしました",
    members: "会員限定",
    level1: "1段階紹介",
    level2: "2段階紹介",
    ops: "AI運営",
    detail: "収益明細",
    withdraw: "報酬を引き出す",
    empty:
      "有効な会員ウォレットを接続すると、実際のリンクとオンチェーン収益を表示します。",
    rule: "紹介できるのは会員のみ。未配分の報酬はAI運営費になります。",
  },
} as const;

export default function BnbxAiReferralPreviewPage() {
  const { language } = useLanguage();
  const { address } = useAccount();
  const t = copy[language];
  const [copied, setCopied] = useState(false);
  const inviteUrl = `https://bnbx.meme/?xone=${address ?? "member"}`;

  async function share() {
    if (navigator.share) {
      await navigator.share({
        title: "BNBX AI · X-One",
        text: t.intro,
        url: inviteUrl,
      });
    } else {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.previewBadge}>{t.locked}</div>
        <p className={styles.eyebrow}>{t.eyebrow}</p>
        <h1>{t.title}</h1>
        <p className={styles.intro}>{t.intro}</p>
        <div className={styles.actions}>
          <button disabled title={t.locked}>
            {t.join}
          </button>
          <button className={styles.secondary} onClick={() => void share()}>
            {copied ? t.copied : t.share}
          </button>
        </div>
      </section>

      <section className={styles.split} aria-label="0.1 BNB split">
        <article>
          <span>50%</span>
          <strong>{t.level1}</strong>
          <b>0.05 BNB</b>
        </article>
        <article>
          <span>25%</span>
          <strong>{t.level2}</strong>
          <b>0.025 BNB</b>
        </article>
        <article>
          <span>25%</span>
          <strong>{t.ops}</strong>
          <b>0.025 BNB</b>
        </article>
      </section>

      <section className={styles.dashboard}>
        <div className={styles.dashboardTitle}>
          <div>
            <small>{t.members}</small>
            <h2>{t.detail}</h2>
          </div>
          <button disabled>{t.withdraw}</button>
        </div>
        <div className={styles.metrics}>
          <article>
            <small>{t.level1}</small>
            <strong>0.000 BNB</strong>
            <span>0 members</span>
          </article>
          <article>
            <small>{t.level2}</small>
            <strong>0.000 BNB</strong>
            <span>0 members</span>
          </article>
          <article>
            <small>Claimable</small>
            <strong>0.000 BNB</strong>
            <span>On-chain</span>
          </article>
        </div>
        <div className={styles.empty}>{t.empty}</div>
        <p className={styles.rule}>{t.rule}</p>
      </section>
    </main>
  );
}
