import type { Language } from "@/components/language-provider";
import type { CreateSubmitBlocker } from "./create-validation-core";

export const localeByLanguage: Record<Language, string> = {
  zh: "zh-CN",
  en: "en-US",
  ko: "ko-KR",
  ja: "ja-JP",
};

type AccessibilityCopy = {
  brandHome: string;
  primaryNavigation: string;
  mobileNavigation: string;
  homeBanner: string;
  previousBanner: string;
  nextBanner: string;
  bannerSlide: string;
  chart: string;
  chartPeriod: string;
  graduationPresets: string;
  tokenLogo: string;
};

export const accessibilityCopy: Record<Language, AccessibilityCopy> = {
  zh: {
    brandHome: "BNBX 首页",
    primaryNavigation: "主导航",
    mobileNavigation: "移动端导航",
    homeBanner: "BNBX 平台横幅",
    previousBanner: "上一张横幅",
    nextBanner: "下一张横幅",
    bannerSlide: "切换到第 {index} 张横幅",
    chart: "K 线图",
    chartPeriod: "K 线周期",
    graduationPresets: "毕业额度预设",
    tokenLogo: "{name} 代币 Logo",
  },
  en: {
    brandHome: "BNBX home",
    primaryNavigation: "Primary navigation",
    mobileNavigation: "Mobile navigation",
    homeBanner: "BNBX platform banner",
    previousBanner: "Previous banner",
    nextBanner: "Next banner",
    bannerSlide: "Go to banner {index}",
    chart: "Candlestick chart",
    chartPeriod: "Chart interval",
    graduationPresets: "Graduation target presets",
    tokenLogo: "{name} token logo",
  },
  ko: {
    brandHome: "BNBX 홈",
    primaryNavigation: "주요 탐색",
    mobileNavigation: "모바일 탐색",
    homeBanner: "BNBX 플랫폼 배너",
    previousBanner: "이전 배너",
    nextBanner: "다음 배너",
    bannerSlide: "{index}번 배너로 이동",
    chart: "캔들 차트",
    chartPeriod: "차트 주기",
    graduationPresets: "졸업 목표 프리셋",
    tokenLogo: "{name} 토큰 로고",
  },
  ja: {
    brandHome: "BNBX ホーム",
    primaryNavigation: "メインナビゲーション",
    mobileNavigation: "モバイルナビゲーション",
    homeBanner: "BNBX プラットフォームバナー",
    previousBanner: "前のバナー",
    nextBanner: "次のバナー",
    bannerSlide: "バナー {index} に移動",
    chart: "ローソク足チャート",
    chartPeriod: "チャート期間",
    graduationPresets: "卒業目標プリセット",
    tokenLogo: "{name} トークンロゴ",
  },
};

type TemplateCopy = {
  name: string;
  badge: string;
  text: string;
};

type CreateErrorCopy = {
  metadataUploadFailed: string;
  walletRequired: string;
  marketingWalletInvalid: string;
  rewardTokenInvalid: string;
  rewardPoolMissing: string;
  rewardsFactoryMissing: string;
  selectedFactoryMissing: string;
  vanityUnavailable: string;
  communityInvalid: string;
  communityHttps: string;
  telegramInvalid: string;
  twitterInvalid: string;
  deboxInvalid: string;
  qqInvalid: string;
  duplicateCommunityLinks: string;
  imageTypeInvalid: string;
  imageTooLarge: string;
  imageUploadFailed: string;
  imageCidMissing: string;
  ipfsUnavailable: string;
  nameSymbolRequired: string;
  metadataCidMissing: string;
  uploadFailed: string;
};

type CreateCopy = {
  lead: string;
  templates: Record<"standard" | "holders" | "lp", TemplateCopy>;
  advancedWarningTitle: string;
  advancedWarningBody: string;
  taxTitle: string;
  taxHelp: string;
  buyTax: string;
  sellTax: string;
  taxLabels: Record<"burn" | "liquidity" | "marketing" | "rewards", string>;
  marketingWallet: string;
  rewardToken: string;
  rewardTokenHelp: string;
  creatorDefault: string;
  minimumHolderBalance: string;
  minimumLpBalance: string;
  rewardsHelp: string;
  factorySafetyLock: string;
  taxInvalid: string;
  taxNumberInvalid: string;
  submitBlockers: Record<CreateSubmitBlocker, string>;
  errors: CreateErrorCopy;
};

export const createCopy: Record<Language, CreateCopy> = {
  zh: {
    lead: "零代码创建固定 10 亿供应的代币。先选择公开模板与税费规则，创建者首笔买入可与部署在同一笔交易内完成。",
    templates: {
      standard: {
        name: "标准 0 税",
        badge: "推荐新手 · 永久 0 税",
        text: "低复杂度 · 无增发、无黑名单 · 创建费 0.001 BNB。",
      },
      holders: {
        name: "持币分红",
        badge: "高级 · 分红税",
        text: "高复杂度 · 按合格持币数量分配指定代币奖励 · 创建费 0.001 BNB。",
      },
      lp: {
        name: "LP 分红",
        badge: "高级 · LP 分红税",
        text: "高复杂度 · 质押新增 Pancake LP 后按份额领取指定代币 · 创建费 0.001 BNB。",
      },
    },
    advancedWarningTitle: "你选择的是毕业后有税模板",
    advancedWarningBody:
      "内盘交易和毕业加池期间不收代币税；进入 PancakeSwap V2 后，才按下方公开配置启用买入税和卖出税。请确认税率、营销钱包和分红门槛后再创建。",
    taxTitle: "毕业后的代币税配置",
    taxHelp:
      "代币税在内盘和创建流动性时保持关闭，只在毕业进入 Pancake V2 后启用。买入和卖出分别最多 10%。",
    buyTax: "买入税",
    sellTax: "卖出税",
    taxLabels: {
      burn: "销毁",
      liquidity: "自动加池",
      marketing: "营销",
      rewards: "分红",
    },
    marketingWallet: "营销钱包",
    rewardToken: "分红代币合约地址",
    rewardTokenHelp:
      "必须是 BSC 上已有 WBNB 流动池的 BEP-20 代币，不能填写 BNB、WBNB 或本次创建的代币。",
    creatorDefault: "默认创建者",
    minimumHolderBalance: "最低参与分红持币量",
    minimumLpBalance: "最低参与分红 LP 数量",
    rewardsHelp:
      "分红税自动兑换为上方指定代币，符合门槛的用户可主动领取；黑洞、曲线和交易对不参与。LP 分红需先把新增 LP 质押到公开分红金库。",
    factorySafetyLock:
      "安全锁定：对应主网 Factory 未配置时不会允许真实创建，避免误部署。",
    taxInvalid: "买入税或卖出税合计超过 10%，请降低税率。",
    taxNumberInvalid: "请输入 0 或更大的数字，最多两位小数。",
    submitBlockers: {
      wallet: "请先连接钱包，才能创建代币。",
      factory: "主网 Factory 尚未配置，暂时无法创建。",
      template: "所选模板当前不可用，请选择可用模板。",
      name: "请填写代币名称。",
      symbol: "请填写代币符号。",
      community: "请修正上方标出的社区链接。",
      initialBuy: "首购金额必须是有效的非负 BNB 数字。",
      tax: "请将买入税和卖出税各自降到 10% 以内。",
      rewards: "请填写有效的分红代币地址和大于 0 的最低参与余额。",
    },
    errors: {
      metadataUploadFailed: "代币资料上传失败",
      walletRequired: "请先连接钱包",
      marketingWalletInvalid: "营销钱包地址格式错误",
      rewardTokenInvalid: "分红代币合约地址格式错误",
      rewardPoolMissing:
        "分红代币必须是已部署合约，并且在 PancakeSwap V2 与 WBNB 的交易对已有非零流动性。",
      rewardsFactoryMissing: "分红模板主网 Factory 尚未配置",
      selectedFactoryMissing: "所选模板主网 Factory 尚未配置",
      vanityUnavailable: "暂未找到 1111 靓号，请重新提交",
      communityInvalid: "社区链接格式无效",
      communityHttps: "社区链接必须使用有效的 HTTPS 地址",
      telegramInvalid: "Telegram 栏只能填写 Telegram 链接或用户名",
      twitterInvalid: "X 栏只能填写 X 链接或用户名",
      deboxInvalid: "DeBox 栏只能填写 DeBox 链接或用户名",
      qqInvalid: "QQ群只能填写 5–12 位数字群号",
      duplicateCommunityLinks: "不同社区栏目不能填写完全相同的链接",
      imageTypeInvalid: "图片仅支持 JPG、PNG、WebP 或 GIF",
      imageTooLarge: "图片不能超过 2MB",
      imageUploadFailed: "代币图片上传失败",
      imageCidMissing: "图片上传未返回 IPFS CID",
      ipfsUnavailable: "IPFS 上传服务尚未配置",
      nameSymbolRequired: "代币名称和符号不能为空",
      metadataCidMissing: "资料上传未返回 IPFS CID",
      uploadFailed: "上传失败，请稍后重试",
    },
  },
  en: {
    lead: "Create a fixed 1B supply token without code. Choose a disclosed template and fee model; creation and the initial buy can run atomically.",
    templates: {
      standard: {
        name: "Standard 0% Tax",
        badge: "RECOMMENDED · PERMANENT 0%",
        text: "Low complexity · no mint or blacklist · 0.001 BNB creation fee.",
      },
      holders: {
        name: "Holder Rewards",
        badge: "ADVANCED · REWARD TAX",
        text: "High complexity · selected-token rewards for eligible holders · 0.001 BNB fee.",
      },
      lp: {
        name: "LP Rewards",
        badge: "ADVANCED · LP REWARDS",
        text: "High complexity · selected-token rewards for staked Pancake LP · 0.001 BNB fee.",
      },
    },
    advancedWarningTitle: "You selected a post-graduation tax template",
    advancedWarningBody:
      "Token tax remains off during the bonding curve and migration. The disclosed buy and sell taxes activate only after the PancakeSwap V2 launch. Confirm every tax, the marketing wallet, and any reward threshold before creating.",
    taxTitle: "Post-graduation taxes",
    taxHelp:
      "Token taxes stay disabled during the bonding curve and graduation. Each side is capped at 10% after Pancake V2 migration.",
    buyTax: "Buy tax",
    sellTax: "Sell tax",
    taxLabels: {
      burn: "Burn",
      liquidity: "Liquidity",
      marketing: "Marketing",
      rewards: "Rewards",
    },
    marketingWallet: "Marketing wallet",
    rewardToken: "Reward token contract",
    rewardTokenHelp:
      "Must be a BEP-20 token with an existing WBNB pool on BSC. BNB, WBNB, and the token being created are not accepted.",
    creatorDefault: "creator default",
    minimumHolderBalance: "Minimum token balance for rewards",
    minimumLpBalance: "Minimum LP balance for rewards",
    rewardsHelp:
      "Reward tax is converted to the selected token and claimed by eligible users. LP rewards require staking newly acquired LP in the public vault.",
    factorySafetyLock:
      "Safety lock: creation is disabled until the corresponding Mainnet Factory is configured.",
    taxInvalid: "Buy or sell tax exceeds the 10% maximum.",
    taxNumberInvalid:
      "Enter zero or a positive number with no more than two decimals.",
    submitBlockers: {
      wallet: "Connect a wallet before creating a token.",
      factory:
        "The Mainnet Factory is not configured, so creation is unavailable.",
      template:
        "The selected template is unavailable. Choose an available template.",
      name: "Enter a token name.",
      symbol: "Enter a token symbol.",
      community: "Correct the highlighted community link fields above.",
      initialBuy: "The initial buy must be a valid non-negative BNB amount.",
      tax: "Reduce both the combined buy tax and sell tax to 10% or less.",
      rewards:
        "Enter a valid reward-token address and a minimum eligible balance above zero.",
    },
    errors: {
      metadataUploadFailed: "Token metadata upload failed",
      walletRequired: "Connect your wallet first",
      marketingWalletInvalid: "The marketing wallet address is invalid",
      rewardTokenInvalid: "The reward token contract address is invalid",
      rewardPoolMissing:
        "The reward token must be deployed and have non-zero liquidity in its PancakeSwap V2 WBNB pair.",
      rewardsFactoryMissing: "The Mainnet rewards Factory is not configured",
      selectedFactoryMissing:
        "The Mainnet Factory for this template is not configured",
      vanityUnavailable:
        "No address ending in 1111 was found. Please submit again.",
      communityInvalid: "The community link is invalid",
      communityHttps: "Community links must use a valid HTTPS address",
      telegramInvalid:
        "Enter a Telegram link or username in the Telegram field",
      twitterInvalid: "Enter an X link or username in the X field",
      deboxInvalid: "Enter a DeBox link or username in the DeBox field",
      qqInvalid: "A QQ group must contain 5–12 digits",
      duplicateCommunityLinks:
        "Community fields cannot use the exact same link",
      imageTypeInvalid: "Images must be JPG, PNG, WebP, or GIF",
      imageTooLarge: "The image must be 2MB or smaller",
      imageUploadFailed: "Token image upload failed",
      imageCidMissing: "The image upload did not return an IPFS CID",
      ipfsUnavailable: "The IPFS upload service is not configured",
      nameSymbolRequired: "Token name and symbol are required",
      metadataCidMissing: "The metadata upload did not return an IPFS CID",
      uploadFailed: "Upload failed. Please try again.",
    },
  },
  ko: {
    lead: "코딩 없이 10억 고정 공급 토큰을 생성합니다. 공개 템플릿과 수수료 규칙을 선택하고 생성과 최초 구매를 한 거래에서 처리할 수 있습니다.",
    templates: {
      standard: {
        name: "표준 0% 세금",
        badge: "초보자 추천 · 영구 0%",
        text: "낮은 복잡도 · 추가 발행 및 블랙리스트 없음 · 생성 수수료 0.001 BNB.",
      },
      holders: {
        name: "홀더 보상",
        badge: "고급 · 보상 세금",
        text: "높은 복잡도 · 조건을 충족한 홀더에게 지정 토큰 보상 · 수수료 0.001 BNB.",
      },
      lp: {
        name: "LP 보상",
        badge: "고급 · LP 보상",
        text: "높은 복잡도 · 스테이킹한 Pancake LP에 지정 토큰 보상 · 수수료 0.001 BNB.",
      },
    },
    advancedWarningTitle: "졸업 후 세금이 적용되는 템플릿을 선택했습니다",
    advancedWarningBody:
      "본딩 커브와 유동성 이전 중에는 토큰 세금이 없습니다. 아래 공개된 매수·매도 세금은 PancakeSwap V2 출시 후에만 적용됩니다. 생성 전에 세율, 마케팅 지갑, 보상 기준을 확인하세요.",
    taxTitle: "졸업 후 토큰 세금",
    taxHelp:
      "본딩 커브와 졸업 중에는 토큰 세금이 비활성화됩니다. PancakeSwap V2 이전 후 매수와 매도 각각 최대 10%입니다.",
    buyTax: "매수 세금",
    sellTax: "매도 세금",
    taxLabels: {
      burn: "소각",
      liquidity: "유동성",
      marketing: "마케팅",
      rewards: "보상",
    },
    marketingWallet: "마케팅 지갑",
    rewardToken: "보상 토큰 컨트랙트",
    rewardTokenHelp:
      "BSC에서 기존 WBNB 풀이 있는 BEP-20 토큰이어야 합니다. BNB, WBNB 및 새로 생성할 토큰은 사용할 수 없습니다.",
    creatorDefault: "생성자 기본값",
    minimumHolderBalance: "보상 최소 토큰 보유량",
    minimumLpBalance: "보상 최소 LP 보유량",
    rewardsHelp:
      "보상 세금은 지정 토큰으로 전환됩니다. LP 보상은 새로 취득한 LP를 공개 보상 금고에 스테이킹해야 합니다.",
    factorySafetyLock:
      "안전 잠금: 해당 메인넷 Factory가 설정될 때까지 실제 생성을 차단합니다.",
    taxInvalid: "매수 또는 매도 세금 합계가 최대 10%를 초과했습니다.",
    taxNumberInvalid: "0 이상의 숫자를 소수 둘째 자리까지 입력하세요.",
    submitBlockers: {
      wallet: "토큰을 생성하려면 먼저 지갑을 연결하세요.",
      factory: "메인넷 Factory가 설정되지 않아 현재 생성할 수 없습니다.",
      template:
        "선택한 템플릿을 사용할 수 없습니다. 사용 가능한 템플릿을 선택하세요.",
      name: "토큰 이름을 입력하세요.",
      symbol: "토큰 심볼을 입력하세요.",
      community: "위에 표시된 커뮤니티 링크 항목을 수정하세요.",
      initialBuy: "최초 구매액은 유효한 0 이상의 BNB 숫자여야 합니다.",
      tax: "매수 및 매도 세금 합계를 각각 10% 이하로 낮추세요.",
      rewards: "유효한 보상 토큰 주소와 0보다 큰 최소 참여 잔액을 입력하세요.",
    },
    errors: {
      metadataUploadFailed: "토큰 메타데이터 업로드에 실패했습니다",
      walletRequired: "먼저 지갑을 연결하세요",
      marketingWalletInvalid: "마케팅 지갑 주소가 올바르지 않습니다",
      rewardTokenInvalid: "보상 토큰 컨트랙트 주소가 올바르지 않습니다",
      rewardPoolMissing:
        "보상 토큰은 배포된 컨트랙트여야 하며 PancakeSwap V2 WBNB 페어에 0보다 큰 유동성이 있어야 합니다.",
      rewardsFactoryMissing: "메인넷 보상 Factory가 설정되지 않았습니다",
      selectedFactoryMissing:
        "선택한 템플릿의 메인넷 Factory가 설정되지 않았습니다",
      vanityUnavailable:
        "1111로 끝나는 주소를 찾지 못했습니다. 다시 제출하세요.",
      communityInvalid: "커뮤니티 링크 형식이 올바르지 않습니다",
      communityHttps: "커뮤니티 링크는 유효한 HTTPS 주소여야 합니다",
      telegramInvalid:
        "Telegram 항목에는 Telegram 링크 또는 사용자 이름을 입력하세요",
      twitterInvalid: "X 항목에는 X 링크 또는 사용자 이름을 입력하세요",
      deboxInvalid: "DeBox 항목에는 DeBox 링크 또는 사용자 이름을 입력하세요",
      qqInvalid: "QQ 그룹 번호는 5–12자리 숫자여야 합니다",
      duplicateCommunityLinks:
        "서로 다른 커뮤니티 항목에 같은 링크를 사용할 수 없습니다",
      imageTypeInvalid: "이미지는 JPG, PNG, WebP 또는 GIF만 지원합니다",
      imageTooLarge: "이미지는 2MB 이하여야 합니다",
      imageUploadFailed: "토큰 이미지 업로드에 실패했습니다",
      imageCidMissing: "이미지 업로드에서 IPFS CID를 받지 못했습니다",
      ipfsUnavailable: "IPFS 업로드 서비스가 설정되지 않았습니다",
      nameSymbolRequired: "토큰 이름과 심볼은 필수입니다",
      metadataCidMissing: "메타데이터 업로드에서 IPFS CID를 받지 못했습니다",
      uploadFailed: "업로드에 실패했습니다. 잠시 후 다시 시도하세요.",
    },
  },
  ja: {
    lead: "コード不要で10億固定供給トークンを作成。公開テンプレートと税設定を選択し、作成と初回購入を同一取引で実行できます。",
    templates: {
      standard: {
        name: "標準 0% 税",
        badge: "初心者向け · 永久 0%",
        text: "低複雑度 · 追加発行・ブラックリストなし · 作成手数料 0.001 BNB。",
      },
      holders: {
        name: "ホルダー報酬",
        badge: "上級 · 報酬税",
        text: "高複雑度 · 条件を満たすホルダーに指定トークン報酬 · 手数料 0.001 BNB。",
      },
      lp: {
        name: "LP 報酬",
        badge: "上級 · LP 報酬",
        text: "高複雑度 · ステーク済み Pancake LP に指定トークン報酬 · 手数料 0.001 BNB。",
      },
    },
    advancedWarningTitle: "卒業後に税が適用されるテンプレートです",
    advancedWarningBody:
      "ボンディングカーブと流動性移行中はトークン税がかかりません。下記の公開された売買税はPancakeSwap V2移行後のみ有効です。作成前に税率、マーケティングウォレット、報酬条件を確認してください。",
    taxTitle: "卒業後のトークン税",
    taxHelp:
      "ボンディングカーブと卒業処理中はトークン税が無効です。PancakeSwap V2移行後、売買それぞれ最大10%です。",
    buyTax: "買い税",
    sellTax: "売り税",
    taxLabels: {
      burn: "バーン",
      liquidity: "流動性",
      marketing: "マーケティング",
      rewards: "報酬",
    },
    marketingWallet: "マーケティングウォレット",
    rewardToken: "報酬トークンのコントラクト",
    rewardTokenHelp:
      "BSC 上で既存の WBNB プールを持つ BEP-20 が必要です。BNB、WBNB、今回作成するトークンは指定できません。",
    creatorDefault: "作成者を初期値に使用",
    minimumHolderBalance: "報酬対象の最低トークン保有量",
    minimumLpBalance: "報酬対象の最低 LP 保有量",
    rewardsHelp:
      "報酬税は指定トークンに変換されます。LP 報酬には新たに取得した LP を公開報酬保管庫へステークする必要があります。",
    factorySafetyLock:
      "安全ロック：対応するメインネットFactoryが設定されるまで実際の作成を無効にします。",
    taxInvalid: "買い税または売り税の合計が上限10%を超えています。",
    taxNumberInvalid: "0以上の数値を小数点以下2桁まで入力してください。",
    submitBlockers: {
      wallet: "トークンを作成するには先にウォレットを接続してください。",
      factory: "メインネットFactoryが未設定のため、現在は作成できません。",
      template:
        "選択したテンプレートは利用できません。利用可能なものを選んでください。",
      name: "トークン名を入力してください。",
      symbol: "トークンシンボルを入力してください。",
      community: "上で示されたコミュニティリンク欄を修正してください。",
      initialBuy: "初回購入額には0以上の有効なBNB数値を入力してください。",
      tax: "購入税と売却税の合計をそれぞれ10%以下にしてください。",
      rewards:
        "有効な報酬トークンアドレスと0より大きい最低参加残高を入力してください。",
    },
    errors: {
      metadataUploadFailed: "トークン情報のアップロードに失敗しました",
      walletRequired: "先にウォレットを接続してください",
      marketingWalletInvalid: "マーケティングウォレットのアドレスが無効です",
      rewardTokenInvalid: "報酬トークンのコントラクトアドレスが無効です",
      rewardPoolMissing:
        "報酬トークンはデプロイ済みで、PancakeSwap V2 の WBNB ペアにゼロではない流動性が必要です。",
      rewardsFactoryMissing: "メインネット報酬Factoryが設定されていません",
      selectedFactoryMissing:
        "選択したテンプレートのメインネットFactoryが設定されていません",
      vanityUnavailable:
        "末尾が1111のアドレスを見つけられませんでした。再度送信してください。",
      communityInvalid: "コミュニティリンクの形式が無効です",
      communityHttps:
        "コミュニティリンクには有効なHTTPSアドレスを使用してください",
      telegramInvalid:
        "Telegram欄にはTelegramリンクまたはユーザー名を入力してください",
      twitterInvalid: "X欄にはXリンクまたはユーザー名を入力してください",
      deboxInvalid: "DeBox欄にはDeBoxリンクまたはユーザー名を入力してください",
      qqInvalid: "QQグループ番号は5〜12桁の数字で入力してください",
      duplicateCommunityLinks:
        "複数のコミュニティ欄に同じリンクは使用できません",
      imageTypeInvalid: "画像はJPG、PNG、WebP、GIFのみ対応しています",
      imageTooLarge: "画像は2MB以下にしてください",
      imageUploadFailed: "トークン画像のアップロードに失敗しました",
      imageCidMissing: "画像アップロードからIPFS CIDが返されませんでした",
      ipfsUnavailable: "IPFSアップロードサービスが設定されていません",
      nameSymbolRequired: "トークン名とシンボルは必須です",
      metadataCidMissing:
        "メタデータアップロードからIPFS CIDが返されませんでした",
      uploadFailed:
        "アップロードに失敗しました。しばらくしてから再試行してください。",
    },
  },
};

const createErrorKeyByMessage: Record<string, keyof CreateErrorCopy> = {
  代币资料上传失败: "metadataUploadFailed",
  请先连接钱包: "walletRequired",
  营销钱包地址格式错误: "marketingWalletInvalid",
  "分红模板主网 Factory 尚未配置": "rewardsFactoryMissing",
  "所选模板主网 Factory 尚未配置": "selectedFactoryMissing",
  "暂未找到 1111 靓号，请重新提交": "vanityUnavailable",
  社区链接格式无效: "communityInvalid",
  "社区链接必须使用有效的 HTTPS 地址": "communityHttps",
  "Telegram 栏只能填写对应平台的链接或用户名": "telegramInvalid",
  "X 栏只能填写对应平台的链接或用户名": "twitterInvalid",
  "DeBox 栏只能填写对应平台的链接或用户名": "deboxInvalid",
  "QQ群只能填写 5–12 位数字群号": "qqInvalid",
  不同社区栏目不能填写完全相同的链接: "duplicateCommunityLinks",
  "图片仅支持 JPG、PNG、WebP 或 GIF": "imageTypeInvalid",
  "图片不能超过 2MB": "imageTooLarge",
  代币图片上传失败: "imageUploadFailed",
  "图片上传未返回 IPFS CID": "imageCidMissing",
  "IPFS 上传服务尚未配置": "ipfsUnavailable",
  代币名称和符号不能为空: "nameSymbolRequired",
  "资料上传未返回 IPFS CID": "metadataCidMissing",
  上传失败: "uploadFailed",
};

export function localizeCreateErrorMessage(
  message: string,
  language: Language,
) {
  const key = createErrorKeyByMessage[message];
  if (key) return createCopy[language].errors[key];
  if (language !== "zh" && /[\u3400-\u9fff]/u.test(message)) {
    return createCopy[language].errors.uploadFailed;
  }
  return message;
}

type AdminCopy = {
  title: string;
  lead: string;
  returnMarket: string;
  checkingSession: string;
  walletConfirm: string;
  authenticate: string;
  loginHelp: string;
  commentsFeature: string;
  enabled: string;
  disabled: string;
  disableComments: string;
  enableComments: string;
  disableHelp: string;
  blockedTerms: string;
  blockedTermsHelp: string;
  blockedTermsPlaceholder: string;
  saveTerms: string;
  commentsList: string;
  commentsSummary: string;
  reports: string;
  walletBanned: string;
  banWallet: string;
  unbanWallet: string;
  banReasonPrompt: string;
  defaultBanReason: string;
  unbanConfirm: string;
  bannedWallets: string;
  bannedWalletsSummary: string;
  auditTitle: string;
  auditSummary: string;
  exportAudit: string;
  noAudit: string;
  searchPlaceholder: string;
  noMatches: string;
  hidden: string;
  restore: string;
  hide: string;
  delete: string;
  deleteConfirm: string;
  loadError: string;
  accessDenied: string;
  authenticationFailed: string;
  actionFailed: string;
};

export const adminCopy: Record<Language, AdminCopy> = {
  zh: {
    title: "评论管理",
    lead: "平台总开关、关键词拦截和单条评论处理。管理验证只使用钱包签名，不发送交易、不消耗 Gas。",
    returnMarket: "返回市场",
    checkingSession: "正在检查管理员会话…",
    walletConfirm: "请在钱包确认…",
    authenticate: "签名验证管理员",
    loginHelp:
      "只有预先配置的平台管理签名钱包可以进入；平台营收钱包不具备管理权限。",
    commentsFeature: "评论功能",
    enabled: "已开放",
    disabled: "已下架",
    disableComments: "立即下架评论功能",
    enableComments: "重新开放评论功能",
    disableHelp:
      "下架后，所有代币页停止展示评论和发布入口；历史评论不会被删除。",
    blockedTerms: "敏感关键词",
    blockedTermsHelp: "每行一个；忽略大小写、空格和常见符号。",
    blockedTermsPlaceholder: "政治关键词\n宗教关键词\n垃圾广告词",
    saveTerms: "保存关键词",
    commentsList: "评论列表",
    commentsSummary: "显示最近 {shown} / 共 {total} 条 · 已隐藏 {hidden} 条",
    reports: "举报",
    walletBanned: "已封禁",
    banWallet: "封禁钱包",
    unbanWallet: "解除封禁",
    banReasonPrompt: "请输入封禁原因（1–280 字）",
    defaultBanReason: "违反社区规则",
    unbanConfirm: "确定解除该钱包的评论封禁吗？",
    bannedWallets: "已封禁钱包",
    bannedWalletsSummary: "当前 {count} 个钱包被禁止参与评论和举报",
    auditTitle: "审核日志",
    auditSummary: "显示最近 {count} 条管理员操作",
    exportAudit: "导出 CSV",
    noAudit: "尚无管理员操作记录。",
    searchPlaceholder: "搜索评论、钱包或代币地址",
    noMatches: "没有符合条件的评论。",
    hidden: "已隐藏",
    restore: "恢复展示",
    hide: "隐藏评论",
    delete: "永久删除",
    deleteConfirm: "永久删除后无法恢复，确定删除这条评论吗？",
    loadError: "管理数据读取失败",
    accessDenied: "该钱包没有评论管理权限",
    authenticationFailed: "管理员验证失败",
    actionFailed: "管理操作失败",
  },
  en: {
    title: "Comment Moderation",
    lead: "Manage the platform-wide switch, blocked terms, and individual comments. Admin verification uses a wallet signature only; it sends no transaction and costs no gas.",
    returnMarket: "Return to market",
    checkingSession: "Checking the admin session…",
    walletConfirm: "Confirm in your wallet…",
    authenticate: "Sign in as admin",
    loginHelp:
      "Access is limited to the configured platform admin signing wallet. The platform revenue wallet has no admin access.",
    commentsFeature: "Comments",
    enabled: "Enabled",
    disabled: "Disabled",
    disableComments: "Disable comments now",
    enableComments: "Enable comments again",
    disableHelp:
      "Disabling comments removes the list and posting form from every token page. Existing comments are not deleted.",
    blockedTerms: "Blocked terms",
    blockedTermsHelp:
      "Enter one per line. Matching ignores case, spaces, and common punctuation.",
    blockedTermsPlaceholder: "political term\nreligious term\nspam phrase",
    saveTerms: "Save terms",
    commentsList: "Comment list",
    commentsSummary: "Showing {shown} recent / {total} total · {hidden} hidden",
    reports: "Reports",
    walletBanned: "Banned",
    banWallet: "Ban wallet",
    unbanWallet: "Unban wallet",
    banReasonPrompt: "Enter a ban reason (1–280 characters)",
    defaultBanReason: "Community rules violation",
    unbanConfirm: "Remove this wallet's discussion ban?",
    bannedWallets: "Banned wallets",
    bannedWalletsSummary:
      "{count} wallets are currently blocked from comments and reports",
    auditTitle: "Moderation audit",
    auditSummary: "Showing the latest {count} admin actions",
    exportAudit: "Export CSV",
    noAudit: "No admin actions have been recorded.",
    searchPlaceholder: "Search comments, wallets, or token addresses",
    noMatches: "No comments match the current search.",
    hidden: "Hidden",
    restore: "Restore",
    hide: "Hide comment",
    delete: "Delete permanently",
    deleteConfirm: "This cannot be undone. Permanently delete this comment?",
    loadError: "Moderation data could not be loaded",
    accessDenied: "This wallet does not have comment moderation access",
    authenticationFailed: "Admin verification failed",
    actionFailed: "The moderation action failed",
  },
  ko: {
    title: "댓글 관리",
    lead: "플랫폼 전체 스위치, 차단 키워드, 개별 댓글을 관리합니다. 관리자 확인은 지갑 서명만 사용하며 거래나 Gas가 필요하지 않습니다.",
    returnMarket: "마켓으로 돌아가기",
    checkingSession: "관리자 세션을 확인하는 중…",
    walletConfirm: "지갑에서 확인하세요…",
    authenticate: "관리자 서명 인증",
    loginHelp:
      "사전 등록된 플랫폼 관리자 서명 지갑만 접근할 수 있습니다. 플랫폼 수익 지갑에는 관리 권한이 없습니다.",
    commentsFeature: "댓글 기능",
    enabled: "활성화",
    disabled: "비활성화",
    disableComments: "댓글 기능 비활성화",
    enableComments: "댓글 기능 다시 활성화",
    disableHelp:
      "비활성화하면 모든 토큰 페이지에서 댓글 목록과 작성란이 사라집니다. 기존 댓글은 삭제되지 않습니다.",
    blockedTerms: "차단 키워드",
    blockedTermsHelp:
      "한 줄에 하나씩 입력하세요. 대소문자, 공백, 일반 기호는 무시합니다.",
    blockedTermsPlaceholder: "정치 키워드\n종교 키워드\n스팸 문구",
    saveTerms: "키워드 저장",
    commentsList: "댓글 목록",
    commentsSummary: "최근 {shown}개 표시 / 전체 {total}개 · 숨김 {hidden}개",
    reports: "신고",
    walletBanned: "차단됨",
    banWallet: "지갑 차단",
    unbanWallet: "차단 해제",
    banReasonPrompt: "차단 사유를 입력하세요 (1–280자)",
    defaultBanReason: "커뮤니티 규칙 위반",
    unbanConfirm: "이 지갑의 댓글 차단을 해제할까요?",
    bannedWallets: "차단된 지갑",
    bannedWalletsSummary:
      "현재 {count}개 지갑이 댓글 및 신고에서 차단되었습니다",
    auditTitle: "관리 감사 로그",
    auditSummary: "최근 관리자 작업 {count}개 표시",
    exportAudit: "CSV 내보내기",
    noAudit: "기록된 관리자 작업이 없습니다.",
    searchPlaceholder: "댓글, 지갑 또는 토큰 주소 검색",
    noMatches: "조건에 맞는 댓글이 없습니다.",
    hidden: "숨김",
    restore: "다시 표시",
    hide: "댓글 숨기기",
    delete: "영구 삭제",
    deleteConfirm: "삭제 후 복구할 수 없습니다. 이 댓글을 영구 삭제할까요?",
    loadError: "관리 데이터를 불러오지 못했습니다",
    accessDenied: "이 지갑에는 댓글 관리 권한이 없습니다",
    authenticationFailed: "관리자 인증에 실패했습니다",
    actionFailed: "관리 작업에 실패했습니다",
  },
  ja: {
    title: "コメント管理",
    lead: "プラットフォーム全体の切替、禁止語、個別コメントを管理します。管理者確認はウォレット署名のみを使用し、取引もGasも発生しません。",
    returnMarket: "マーケットへ戻る",
    checkingSession: "管理者セッションを確認中…",
    walletConfirm: "ウォレットで確認してください…",
    authenticate: "管理者として署名",
    loginHelp:
      "事前登録済みのプラットフォーム管理署名ウォレットのみアクセスできます。収益受取ウォレットに管理権限はありません。",
    commentsFeature: "コメント機能",
    enabled: "有効",
    disabled: "無効",
    disableComments: "コメント機能を無効化",
    enableComments: "コメント機能を再開",
    disableHelp:
      "無効化すると、すべてのトークンページでコメント一覧と投稿欄が非表示になります。既存コメントは削除されません。",
    blockedTerms: "禁止キーワード",
    blockedTermsHelp:
      "1行に1語ずつ入力してください。大文字小文字、空白、一般的な記号は無視されます。",
    blockedTermsPlaceholder: "政治キーワード\n宗教キーワード\nスパム文言",
    saveTerms: "キーワードを保存",
    commentsList: "コメント一覧",
    commentsSummary: "最新 {shown} 件 / 全 {total} 件 · 非表示 {hidden} 件",
    reports: "報告",
    walletBanned: "ブロック済み",
    banWallet: "ウォレットをブロック",
    unbanWallet: "ブロック解除",
    banReasonPrompt: "ブロック理由を入力してください（1～280文字）",
    defaultBanReason: "コミュニティルール違反",
    unbanConfirm: "このウォレットのコメント制限を解除しますか？",
    bannedWallets: "ブロック済みウォレット",
    bannedWalletsSummary:
      "現在 {count} ウォレットがコメントと報告を制限されています",
    auditTitle: "モデレーション監査ログ",
    auditSummary: "最新の管理操作 {count} 件を表示",
    exportAudit: "CSVを書き出す",
    noAudit: "管理操作の記録はありません。",
    searchPlaceholder: "コメント、ウォレット、トークンアドレスを検索",
    noMatches: "条件に一致するコメントはありません。",
    hidden: "非表示",
    restore: "再表示",
    hide: "コメントを隠す",
    delete: "完全に削除",
    deleteConfirm: "削除後は復元できません。このコメントを完全に削除しますか？",
    loadError: "管理データを読み込めませんでした",
    accessDenied: "このウォレットにはコメント管理権限がありません",
    authenticationFailed: "管理者認証に失敗しました",
    actionFailed: "管理操作に失敗しました",
  },
};

export function interpolate(
  template: string,
  values: Record<string, string | number>,
) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

type DeploymentCopy = {
  titleMainnet: string;
  titleTestnet: string;
  leadMainnet: string;
  leadTestnet: string;
  factoryType: string;
  rewardsOption: string;
  standardOption: string;
  connectMainnetWallet: string;
  connectTestnetWallet: string;
  authorizedWalletOnly: string;
  switchMainnet: string;
  switchTestnet: string;
  advancedStepsHelp: string;
  step1Done: string;
  step1Confirm: string;
  step1Waiting: string;
  step1Deploy: string;
  step2Done: string;
  step2Confirm: string;
  step2Waiting: string;
  step2Rewards: string;
  step3Done: string;
  step3Confirm: string;
  step3Waiting: string;
  step3Authorize: string;
  confirmDeploy: string;
  waitMainnet: string;
  waitTestnet: string;
  deployStandard: string;
  deploymentTransaction: string;
  factoryDeployed: string;
  advancedDeployer: string;
  rewards: string;
  configured: string;
  errorCancelled: string;
  errorMainnetFunds: string;
  errorTestnetFunds: string;
  errorCodeSize: string;
  errorFailed: string;
};

export const deploymentCopy: Record<Language, DeploymentCopy> = {
  zh: {
    titleMainnet: "部署 BNBX 主网小额灰度 Factory",
    titleTestnet: "部署 BNBX 测试网 Factory",
    leadMainnet:
      "仅部署到 BSC Mainnet；毕业档位为 0.01–0.18 BNB。部署费接收地址和 Pancake V2 Router 已固定，MetaMask 会在发送前显示 Gas 费用。",
    leadTestnet:
      "仅部署到 BSC Testnet。部署费接收地址和 Pancake V2 Router 已固定，MetaMask 会在发送前显示 Gas 费用。",
    factoryType: "Factory 类型",
    rewardsOption: "持币分红 / LP 分红 Factory",
    standardOption: "标准 0 税 Factory",
    connectMainnetWallet: "请先连接持有 BNB 的部署钱包。",
    connectTestnetWallet: "请先连接持有 tBNB 的部署钱包。",
    authorizedWalletOnly:
      "正式 Factory 只能由已授权部署钱包 0xbE37…B0a2 签名。平台营收地址不会改变。",
    switchMainnet: "切换到 BNB 主网",
    switchTestnet: "切换到 BNB 测试网",
    advancedStepsHelp:
      "持币分红与 LP 分红共用 V3 Factory，需依次完成三笔链上操作。每一步确认后才会开放下一步。",
    step1Done: "步骤 1 已完成",
    step1Confirm: "请确认步骤 1…",
    step1Waiting: "等待步骤 1 上链…",
    step1Deploy: "步骤 1：部署高级代币部署器",
    step2Done: "步骤 2 已完成",
    step2Confirm: "请确认步骤 2…",
    step2Waiting: "等待步骤 2 上链…",
    step2Rewards: "步骤 2：部署分红 Factory",
    step3Done: "步骤 3 已完成，Factory 可用",
    step3Confirm: "请确认步骤 3…",
    step3Waiting: "等待步骤 3 上链…",
    step3Authorize: "步骤 3：授权 Factory 创建代币",
    confirmDeploy: "请在 MetaMask 确认部署…",
    waitMainnet: "等待主网确认…",
    waitTestnet: "等待测试网确认…",
    deployStandard: "部署标准 0 税 Factory",
    deploymentTransaction: "部署交易",
    factoryDeployed: "Factory 部署成功",
    advancedDeployer: "高级代币部署器",
    rewards: "分红",
    configured: "配置成功。请将 {variable} 设为：{address}",
    errorCancelled: "你已在 MetaMask 取消部署。",
    errorMainnetFunds: "主网钱包的 BNB 不足以支付部署 Gas。",
    errorTestnetFunds: "测试钱包的 tBNB 不足以支付部署 Gas。",
    errorCodeSize:
      "Factory 代码超过 BSC 合约大小限制，请使用最新部署页面后重试。",
    errorFailed: "交易未成功发送：{message}",
  },
  en: {
    titleMainnet: "Deploy the BNBX Mainnet Canary Factory",
    titleTestnet: "Deploy the BNBX Testnet Factory",
    leadMainnet:
      "Deploys only to BSC Mainnet with 0.01–0.18 BNB graduation targets. The fee recipient and Pancake V2 Router are fixed; MetaMask shows the gas cost before sending.",
    leadTestnet:
      "Deploys only to BSC Testnet. The fee recipient and Pancake V2 Router are fixed; MetaMask shows the gas cost before sending.",
    factoryType: "Factory type",
    rewardsOption: "Holder / LP Rewards Factory",
    standardOption: "Standard 0% Tax Factory",
    connectMainnetWallet: "Connect a deployment wallet funded with BNB.",
    connectTestnetWallet: "Connect a deployment wallet funded with tBNB.",
    authorizedWalletOnly:
      "The official Factory must be signed by the authorized 0xbE37…B0a2 deployment wallet. The platform revenue recipient stays unchanged.",
    switchMainnet: "Switch to BNB Mainnet",
    switchTestnet: "Switch to BNB Testnet",
    advancedStepsHelp:
      "Holder and LP rewards share one V3 Factory and require three on-chain steps in order. Each next step unlocks after the previous confirmation.",
    step1Done: "Step 1 complete",
    step1Confirm: "Confirm step 1…",
    step1Waiting: "Waiting for step 1…",
    step1Deploy: "Step 1: deploy the advanced token deployer",
    step2Done: "Step 2 complete",
    step2Confirm: "Confirm step 2…",
    step2Waiting: "Waiting for step 2…",
    step2Rewards: "Step 2: deploy the Rewards Factory",
    step3Done: "Step 3 complete; Factory is ready",
    step3Confirm: "Confirm step 3…",
    step3Waiting: "Waiting for step 3…",
    step3Authorize: "Step 3: authorize the Factory to create tokens",
    confirmDeploy: "Confirm the deployment in MetaMask…",
    waitMainnet: "Waiting for Mainnet confirmation…",
    waitTestnet: "Waiting for Testnet confirmation…",
    deployStandard: "Deploy the Standard 0% Tax Factory",
    deploymentTransaction: "Deployment transaction",
    factoryDeployed: "Factory deployed",
    advancedDeployer: "Advanced token deployer",
    rewards: "Rewards",
    configured: "Configuration complete. Set {variable} to {address}",
    errorCancelled: "You cancelled the deployment in MetaMask.",
    errorMainnetFunds:
      "The Mainnet wallet does not have enough BNB for deployment gas.",
    errorTestnetFunds:
      "The Testnet wallet does not have enough tBNB for deployment gas.",
    errorCodeSize:
      "The Factory exceeds the BSC contract size limit. Use the latest deployment page and try again.",
    errorFailed: "The transaction was not sent: {message}",
  },
  ko: {
    titleMainnet: "BNBX 메인넷 카나리 Factory 배포",
    titleTestnet: "BNBX 테스트넷 Factory 배포",
    leadMainnet:
      "BSC Mainnet에만 배포하며 졸업 목표는 0.01–0.18 BNB입니다. 수수료 수령 주소와 Pancake V2 Router는 고정되어 있고 전송 전에 MetaMask가 Gas 비용을 표시합니다.",
    leadTestnet:
      "BSC Testnet에만 배포합니다. 수수료 수령 주소와 Pancake V2 Router는 고정되어 있고 전송 전에 MetaMask가 Gas 비용을 표시합니다.",
    factoryType: "Factory 유형",
    rewardsOption: "홀더 / LP 보상 Factory",
    standardOption: "표준 0% 세금 Factory",
    connectMainnetWallet: "BNB가 있는 배포 지갑을 연결하세요.",
    connectTestnetWallet: "tBNB가 있는 배포 지갑을 연결하세요.",
    authorizedWalletOnly:
      "공식 Factory는 승인된 0xbE37…B0a2 배포 지갑으로만 서명해야 합니다. 플랫폼 수익 주소는 변경되지 않습니다.",
    switchMainnet: "BNB 메인넷으로 전환",
    switchTestnet: "BNB 테스트넷으로 전환",
    advancedStepsHelp:
      "홀더 및 LP 보상은 하나의 V3 Factory를 공유하며 세 단계의 온체인 작업을 순서대로 완료해야 합니다. 이전 단계가 확인되면 다음 단계가 열립니다.",
    step1Done: "1단계 완료",
    step1Confirm: "1단계를 확인하세요…",
    step1Waiting: "1단계 온체인 확인 중…",
    step1Deploy: "1단계: 고급 토큰 배포기 배포",
    step2Done: "2단계 완료",
    step2Confirm: "2단계를 확인하세요…",
    step2Waiting: "2단계 온체인 확인 중…",
    step2Rewards: "2단계: 보상 Factory 배포",
    step3Done: "3단계 완료; Factory 사용 가능",
    step3Confirm: "3단계를 확인하세요…",
    step3Waiting: "3단계 온체인 확인 중…",
    step3Authorize: "3단계: Factory 토큰 생성 권한 부여",
    confirmDeploy: "MetaMask에서 배포를 확인하세요…",
    waitMainnet: "메인넷 확인을 기다리는 중…",
    waitTestnet: "테스트넷 확인을 기다리는 중…",
    deployStandard: "표준 0% 세금 Factory 배포",
    deploymentTransaction: "배포 거래",
    factoryDeployed: "Factory 배포 완료",
    advancedDeployer: "고급 토큰 배포기",
    rewards: "보상",
    configured: "설정 완료. {variable} 값을 {address}(으)로 지정하세요.",
    errorCancelled: "MetaMask에서 배포를 취소했습니다.",
    errorMainnetFunds: "메인넷 지갑의 BNB가 배포 Gas 비용에 부족합니다.",
    errorTestnetFunds: "테스트넷 지갑의 tBNB가 배포 Gas 비용에 부족합니다.",
    errorCodeSize:
      "Factory가 BSC 컨트랙트 크기 제한을 초과했습니다. 최신 배포 페이지에서 다시 시도하세요.",
    errorFailed: "거래가 전송되지 않았습니다: {message}",
  },
  ja: {
    titleMainnet: "BNBX メインネット・カナリー Factory をデプロイ",
    titleTestnet: "BNBX テストネット Factory をデプロイ",
    leadMainnet:
      "BSC Mainnetのみにデプロイし、卒業目標は0.01〜0.18 BNBです。手数料受取先とPancake V2 Routerは固定され、送信前にMetaMaskがGas費用を表示します。",
    leadTestnet:
      "BSC Testnetのみにデプロイします。手数料受取先とPancake V2 Routerは固定され、送信前にMetaMaskがGas費用を表示します。",
    factoryType: "Factory の種類",
    rewardsOption: "ホルダー / LP 報酬 Factory",
    standardOption: "標準 0% 税 Factory",
    connectMainnetWallet:
      "BNBを保有するデプロイ用ウォレットを接続してください。",
    connectTestnetWallet:
      "tBNBを保有するデプロイ用ウォレットを接続してください。",
    authorizedWalletOnly:
      "公式Factoryは承認済みのデプロイウォレット 0xbE37…B0a2 でのみ署名できます。プラットフォーム収益先は変更されません。",
    switchMainnet: "BNBメインネットへ切替",
    switchTestnet: "BNBテストネットへ切替",
    advancedStepsHelp:
      "ホルダー報酬とLP報酬は1つのV3 Factoryを共有し、3つのオンチェーン操作を順番に行います。前の手順が確定すると次へ進めます。",
    step1Done: "手順1完了",
    step1Confirm: "手順1を確認してください…",
    step1Waiting: "手順1の確定待ち…",
    step1Deploy: "手順1：高機能トークンデプロイヤーをデプロイ",
    step2Done: "手順2完了",
    step2Confirm: "手順2を確認してください…",
    step2Waiting: "手順2の確定待ち…",
    step2Rewards: "手順2：報酬Factoryをデプロイ",
    step3Done: "手順3完了；Factoryを利用できます",
    step3Confirm: "手順3を確認してください…",
    step3Waiting: "手順3の確定待ち…",
    step3Authorize: "手順3：Factoryにトークン作成権限を付与",
    confirmDeploy: "MetaMaskでデプロイを確認してください…",
    waitMainnet: "メインネットの確定待ち…",
    waitTestnet: "テストネットの確定待ち…",
    deployStandard: "標準 0% 税 Factoryをデプロイ",
    deploymentTransaction: "デプロイ取引",
    factoryDeployed: "Factoryのデプロイ完了",
    advancedDeployer: "高機能トークンデプロイヤー",
    rewards: "報酬",
    configured: "設定完了。{variable} を {address} に設定してください。",
    errorCancelled: "MetaMaskでデプロイをキャンセルしました。",
    errorMainnetFunds:
      "メインネットウォレットのBNBがデプロイGas費用に不足しています。",
    errorTestnetFunds:
      "テストネットウォレットのtBNBがデプロイGas費用に不足しています。",
    errorCodeSize:
      "FactoryがBSCコントラクトのサイズ上限を超えています。最新のデプロイページから再試行してください。",
    errorFailed: "取引を送信できませんでした：{message}",
  },
};

type AdvancedTokenCopy = {
  holderRewardsToken: string;
  lpRewardsToken: string;
  autoLiquidityToken: string;
  buyTax: string;
  sellTax: string;
  buyAllocation: string;
  sellAllocation: string;
  burn: string;
  liquidity: string;
  marketing: string;
  rewards: string;
  marketingWallet: string;
  holderVault: string;
  lpVault: string;
  claimable: string;
  myRewardWeight: string;
  minimumHolderBalance: string;
  walletLp: string;
  lpAmount: string;
  allAvailableLp: string;
  allStakedLp: string;
  approveLp: string;
  stakeLp: string;
  withdrawLp: string;
  claimRewards: string;
  rewardTransactionFailed: string;
};

export const advancedTokenCopy: Record<Language, AdvancedTokenCopy> = {
  zh: {
    holderRewardsToken: "持币分红代币",
    lpRewardsToken: "LP 分红代币",
    autoLiquidityToken: "自动回流代币",
    buyTax: "买入税",
    sellTax: "卖出税",
    buyAllocation: "买入税分配",
    sellAllocation: "卖出税分配",
    burn: "销毁",
    liquidity: "回流",
    marketing: "营销",
    rewards: "分红",
    marketingWallet: "营销钱包",
    holderVault: "持币分红金库",
    lpVault: "LP 质押分红金库",
    claimable: "可领取",
    myRewardWeight: "我的分红权重",
    minimumHolderBalance: "最低持币门槛",
    walletLp: "钱包可用 LP",
    lpAmount: "质押或取回 LP 数量",
    allAvailableLp: "全部可用 LP",
    allStakedLp: "全部已质押 LP",
    approveLp: "授权 LP",
    stakeLp: "质押 LP",
    withdrawLp: "取回 LP",
    claimRewards: "领取分红",
    rewardTransactionFailed: "分红交易失败，请在钱包中查看详情。",
  },
  en: {
    holderRewardsToken: "Holder Rewards Token",
    lpRewardsToken: "LP Rewards Token",
    autoLiquidityToken: "Auto Liquidity Token",
    buyTax: "Buy tax",
    sellTax: "Sell tax",
    buyAllocation: "Buy-tax allocation",
    sellAllocation: "Sell-tax allocation",
    burn: "Burn",
    liquidity: "Liquidity",
    marketing: "Marketing",
    rewards: "Rewards",
    marketingWallet: "Marketing wallet",
    holderVault: "Holder Rewards Vault",
    lpVault: "LP Staking Rewards Vault",
    claimable: "Claimable",
    myRewardWeight: "My reward weight",
    minimumHolderBalance: "Minimum holder balance",
    walletLp: "Available LP in wallet",
    lpAmount: "LP amount to stake or withdraw",
    allAvailableLp: "All available LP",
    allStakedLp: "All staked LP",
    approveLp: "Approve LP",
    stakeLp: "Stake LP",
    withdrawLp: "Withdraw LP",
    claimRewards: "Claim rewards",
    rewardTransactionFailed:
      "The reward transaction failed. Check your wallet for details.",
  },
  ko: {
    holderRewardsToken: "홀더 보상 토큰",
    lpRewardsToken: "LP 보상 토큰",
    autoLiquidityToken: "자동 유동성 토큰",
    buyTax: "매수 세금",
    sellTax: "매도 세금",
    buyAllocation: "매수 세금 배분",
    sellAllocation: "매도 세금 배분",
    burn: "소각",
    liquidity: "유동성",
    marketing: "마케팅",
    rewards: "보상",
    marketingWallet: "마케팅 지갑",
    holderVault: "홀더 보상 금고",
    lpVault: "LP 스테이킹 보상 금고",
    claimable: "청구 가능",
    myRewardWeight: "내 보상 지분",
    minimumHolderBalance: "최소 토큰 보유량",
    walletLp: "지갑의 사용 가능 LP",
    lpAmount: "스테이킹 또는 출금할 LP 수량",
    allAvailableLp: "사용 가능한 LP 전체",
    allStakedLp: "스테이킹된 LP 전체",
    approveLp: "LP 승인",
    stakeLp: "LP 스테이킹",
    withdrawLp: "LP 출금",
    claimRewards: "보상 청구",
    rewardTransactionFailed:
      "보상 거래에 실패했습니다. 지갑에서 상세 내용을 확인하세요.",
  },
  ja: {
    holderRewardsToken: "ホルダー報酬トークン",
    lpRewardsToken: "LP 報酬トークン",
    autoLiquidityToken: "自動流動性トークン",
    buyTax: "買い税",
    sellTax: "売り税",
    buyAllocation: "買い税の配分",
    sellAllocation: "売り税の配分",
    burn: "バーン",
    liquidity: "流動性",
    marketing: "マーケティング",
    rewards: "報酬",
    marketingWallet: "マーケティングウォレット",
    holderVault: "ホルダー報酬保管庫",
    lpVault: "LP ステーキング報酬保管庫",
    claimable: "請求可能",
    myRewardWeight: "自分の報酬持分",
    minimumHolderBalance: "最低トークン保有量",
    walletLp: "ウォレットの利用可能 LP",
    lpAmount: "ステークまたは引き出す LP 数量",
    allAvailableLp: "利用可能な LP 全額",
    allStakedLp: "ステーク済み LP 全額",
    approveLp: "LP を承認",
    stakeLp: "LP をステーク",
    withdrawLp: "LP を引き出す",
    claimRewards: "報酬を請求",
    rewardTransactionFailed:
      "報酬取引に失敗しました。ウォレットで詳細を確認してください。",
  },
};
