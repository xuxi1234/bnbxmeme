import type { Language } from "@/components/language-provider";

export type BnbxAiCopy = {
  title: string;
  name: string;
  hello: string;
  join: string;
  active: string;
  refill: string;
  unlock: string;
  placeholder: string;
  send: string;
  close: string;
  open: string;
  disclaimer: string;
  connectWallet: string;
  connectWalletFirst: string;
  loadingMembership: string;
  permanentClaim: string;
  refillButton: string;
  verifyingSignature: string;
  thinking: string;
  membershipLoadFailed: string;
  paymentFailed: string;
  signatureFailed: string;
  sendFailed: string;
  sessionExpired: string;
  providerQuota: string;
  providerRateLimit: string;
  providerUnavailable: string;
  creditEmpty: string;
  myXOne: string;
  permanentMember: string;
  activeStatus: string;
  creditBalance: string;
  lifetimeUsage: string;
  paymentCount: string;
  times: string;
  paymentProgress: string;
  paymentWallet: string;
  paymentSubmitted: string;
  paymentVerifying: string;
  paymentSuccess: string;
};

export const bnbxAiCopy: Record<Language, BnbxAiCopy> = {
  zh: {
    title: "BNBX AI",
    name: "小壹 · X-One",
    hello: "你好，我是小壹。可以问我 BNBX 发币、内盘交易、毕业机制和钱包安全。",
    join: "支付 0.1 BNB，永久开通 BNBX AI，领取专属于您的小壹 / X-One。开通会员可持续畅聊，正常使用不按个人额度中断。",
    active:
      "您已是 BNBX AI 永久会员。签名即可领取专属于您的小壹 / X-One；签名不消耗 Gas，也不会授权交易。",
    refill: "您已是永久会员，可以继续与小壹畅聊。",
    unlock: "签名解锁",
    placeholder: "问问 BNBX AI…",
    send: "发送",
    close: "关闭",
    open: "打开 BNBX AI",
    disclaimer: "AI 可能出错，请独立核实；小壹不能替您交易或操作钱包。",
    connectWallet: "请先连接钱包",
    connectWalletFirst: "请先使用页面顶部按钮连接钱包",
    loadingMembership: "正在读取会员状态…",
    permanentClaim: "0.1 BNB 永久领取",
    refillButton: "补充算力 · 0.1 BNB",
    verifyingSignature: "验证中…",
    thinking: "小壹正在思考…",
    membershipLoadFailed: "会员状态暂时无法读取，请稍后重试。",
    paymentFailed: "付款未完成，请检查钱包后重试。",
    signatureFailed: "签名验证失败，请重试。",
    sendFailed: "消息发送失败，请稍后重试。",
    sessionExpired: "安全会话已过期，请重新签名解锁小壹。签名不消耗 Gas。",
    providerQuota:
      "小壹的共享 AI 服务余额暂时不可用，请管理员检查 OpenAI API 账单。您的永久会员资格不受影响。",
    providerRateLimit: "当前同时聊天人数较多，小壹正在缓冲，请稍等几秒后重试。",
    providerUnavailable:
      "小壹的 AI 服务暂时波动，本次未产生有效回答，请稍后重试。",
    creditEmpty: "您的永久会员权益已保留，请补充新一轮 AI 智能算力额度。",
    myXOne: "我的 X-One",
    permanentMember: "永久会员",
    activeStatus: "已开通",
    creditBalance: "畅聊权益",
    lifetimeUsage: "累计使用",
    paymentCount: "开通/补充次数",
    times: "次",
    paymentProgress: "付款进度",
    paymentWallet: "请在钱包中确认",
    paymentSubmitted: "交易已提交",
    paymentVerifying: "正在验证链上付款",
    paymentSuccess: "永久会员已开通 · 小壹已可持续畅聊",
  },
  en: {
    title: "BNBX AI",
    name: "X-One",
    hello:
      "Hi, I’m X-One. Ask me about BNBX launches, bonding-curve trading, graduation, and wallet safety.",
    join: "Pay 0.1 BNB to unlock BNBX AI permanently and claim your personal X-One. Members can keep chatting without an individual credit cutoff under normal use.",
    active:
      "You are a permanent BNBX AI member. Sign to access your X-One. Signing costs no gas and authorizes no transaction.",
    refill: "Your permanent membership is active. Keep chatting with X-One.",
    unlock: "Sign to unlock",
    placeholder: "Ask BNBX AI…",
    send: "Send",
    close: "Close",
    open: "Open BNBX AI",
    disclaimer:
      "AI can make mistakes. Verify independently; X-One cannot trade or control your wallet.",
    connectWallet: "Connect your wallet first",
    connectWalletFirst:
      "Connect your wallet using the button at the top of the page.",
    loadingMembership: "Loading membership…",
    permanentClaim: "Unlock forever · 0.1 BNB",
    refillButton: "Add AI credits · 0.1 BNB",
    verifyingSignature: "Verifying…",
    thinking: "X-One is thinking…",
    membershipLoadFailed:
      "Membership is temporarily unavailable. Try again shortly.",
    paymentFailed:
      "Payment was not completed. Check your wallet and try again.",
    signatureFailed: "Signature verification failed. Please try again.",
    sendFailed: "Message failed to send. Please try again shortly.",
    sessionExpired:
      "Your secure session expired. Sign again to unlock X-One; signing costs no gas.",
    providerQuota:
      "X-One’s shared AI balance is temporarily unavailable. The administrator needs to check OpenAI API billing. Your permanent membership is unaffected.",
    providerRateLimit:
      "X-One is handling high demand. Please wait a few seconds and try again.",
    providerUnavailable:
      "X-One’s AI service is temporarily unstable. No valid answer was produced; please try again shortly.",
    creditEmpty:
      "Your permanent membership remains active. Add a new round of AI credits to continue.",
    myXOne: "My X-One",
    permanentMember: "Permanent member",
    activeStatus: "Active",
    creditBalance: "Chat access",
    lifetimeUsage: "Lifetime usage",
    paymentCount: "Unlocks/top-ups",
    times: "times",
    paymentProgress: "Payment progress",
    paymentWallet: "Confirm in your wallet",
    paymentSubmitted: "Transaction submitted",
    paymentVerifying: "Verifying on-chain payment",
    paymentSuccess: "Permanent membership active · X-One chat unlocked",
  },
  ko: {
    title: "BNBX AI",
    name: "X-One",
    hello:
      "안녕하세요, X-One입니다. BNBX 토큰 출시, 본딩 커브 거래, 졸업 방식과 지갑 보안을 물어보세요.",
    join: "0.1 BNB를 결제하면 BNBX AI를 영구적으로 이용하고 나만의 X-One을 받을 수 있습니다. 정상적인 이용에는 개인 크레딧 제한 없이 계속 대화할 수 있습니다.",
    active:
      "BNBX AI 영구 회원입니다. 서명하면 나만의 X-One을 이용할 수 있습니다. 서명에는 Gas가 들지 않으며 거래 권한을 부여하지 않습니다.",
    refill: "영구 회원 자격이 활성화되어 있습니다. X-One과 계속 대화하세요.",
    unlock: "서명하여 잠금 해제",
    placeholder: "BNBX AI에게 질문하기…",
    send: "보내기",
    close: "닫기",
    open: "BNBX AI 열기",
    disclaimer:
      "AI는 틀릴 수 있습니다. 직접 확인하세요. X-One은 거래하거나 지갑을 조작할 수 없습니다.",
    connectWallet: "먼저 지갑을 연결하세요",
    connectWalletFirst: "페이지 상단 버튼으로 지갑을 먼저 연결하세요.",
    loadingMembership: "회원 상태 확인 중…",
    permanentClaim: "영구 이용 · 0.1 BNB",
    refillButton: "AI 크레딧 충전 · 0.1 BNB",
    verifyingSignature: "확인 중…",
    thinking: "X-One이 생각 중입니다…",
    membershipLoadFailed:
      "회원 상태를 불러올 수 없습니다. 잠시 후 다시 시도하세요.",
    paymentFailed:
      "결제가 완료되지 않았습니다. 지갑을 확인하고 다시 시도하세요.",
    signatureFailed: "서명 확인에 실패했습니다. 다시 시도하세요.",
    sendFailed: "메시지를 보내지 못했습니다. 잠시 후 다시 시도하세요.",
    sessionExpired:
      "보안 세션이 만료되었습니다. X-One을 다시 잠금 해제하려면 서명하세요. 서명에는 Gas가 들지 않습니다.",
    providerQuota:
      "X-One의 공유 AI 잔액을 현재 사용할 수 없습니다. 관리자가 OpenAI API 결제를 확인해야 합니다. 영구 회원 자격은 유지됩니다.",
    providerRateLimit: "현재 이용자가 많습니다. 몇 초 후 다시 시도해 주세요.",
    providerUnavailable:
      "X-One AI 서비스가 일시적으로 불안정합니다. 잠시 후 다시 시도해 주세요.",
    creditEmpty:
      "영구 회원 자격은 유지됩니다. 계속하려면 새 AI 크레딧을 충전하세요.",
    myXOne: "나의 X-One",
    permanentMember: "영구 회원",
    activeStatus: "이용 중",
    creditBalance: "채팅 이용 권한",
    lifetimeUsage: "누적 사용",
    paymentCount: "개통/충전 횟수",
    times: "회",
    paymentProgress: "결제 진행",
    paymentWallet: "지갑에서 확인하세요",
    paymentSubmitted: "거래가 제출되었습니다",
    paymentVerifying: "온체인 결제 확인 중",
    paymentSuccess: "영구 회원 활성화 · X-One 채팅 이용 가능",
  },
  ja: {
    title: "BNBX AI",
    name: "X-One",
    hello:
      "こんにちは、X-Oneです。BNBXでのトークン作成、ボンディングカーブ取引、卒業の仕組み、ウォレット安全について質問できます。",
    join: "0.1 BNBを支払うとBNBX AIを永久に利用でき、あなただけのX-Oneを受け取れます。通常利用では個別クレジット上限なく会話を続けられます。",
    active:
      "BNBX AIの永久会員です。署名すると専用のX-Oneを利用できます。署名にGasはかからず、取引権限も付与しません。",
    refill: "永久会員資格は有効です。X-Oneとの会話を続けられます。",
    unlock: "署名してロック解除",
    placeholder: "BNBX AIに質問…",
    send: "送信",
    close: "閉じる",
    open: "BNBX AIを開く",
    disclaimer:
      "AIは誤る場合があります。必ずご自身で確認してください。X-Oneは取引やウォレット操作を行えません。",
    connectWallet: "先にウォレットを接続してください",
    connectWalletFirst: "ページ上部のボタンからウォレットを接続してください。",
    loadingMembership: "会員情報を確認中…",
    permanentClaim: "永久利用 · 0.1 BNB",
    refillButton: "AIクレジット追加 · 0.1 BNB",
    verifyingSignature: "確認中…",
    thinking: "X-Oneが考えています…",
    membershipLoadFailed:
      "会員情報を取得できません。しばらくしてから再試行してください。",
    paymentFailed:
      "支払いが完了していません。ウォレットを確認して再試行してください。",
    signatureFailed: "署名の確認に失敗しました。もう一度お試しください。",
    sendFailed:
      "メッセージを送信できませんでした。しばらくしてから再試行してください。",
    sessionExpired:
      "セキュアセッションの有効期限が切れました。再度署名してX-Oneを解除してください。署名にGasはかかりません。",
    providerQuota:
      "X-Oneの共有AI残高を現在利用できません。管理者によるOpenAI API請求の確認が必要です。永久会員資格には影響しません。",
    providerRateLimit:
      "現在アクセスが集中しています。数秒待ってから再試行してください。",
    providerUnavailable:
      "X-OneのAIサービスが一時的に不安定です。しばらくしてから再試行してください。",
    creditEmpty:
      "永久会員資格は継続します。新しいAIクレジットを追加して続行できます。",
    myXOne: "マイ X-One",
    permanentMember: "永久会員",
    activeStatus: "有効",
    creditBalance: "チャット利用権",
    lifetimeUsage: "累計使用額",
    paymentCount: "開通・追加回数",
    times: "回",
    paymentProgress: "支払い状況",
    paymentWallet: "ウォレットで確認",
    paymentSubmitted: "トランザクション送信済み",
    paymentVerifying: "オンチェーン支払いを確認中",
    paymentSuccess: "永久会員が有効 · X-Oneチャット利用可能",
  },
};
