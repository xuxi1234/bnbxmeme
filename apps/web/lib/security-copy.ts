import type { Language } from "@/components/language-provider";

type DisclosureRow = readonly [label: string, value: string];

type SecurityCopy = {
  eyebrow: string;
  title: string;
  lead: string;
  domain: string;
  contracts: string;
  fees: string;
  feeItems: readonly DisclosureRow[];
  factoryLabels: {
    standard: string;
    legacyStandard: string;
    autoLiquidity: string;
    rewards: string;
    legacyRewards: string;
    router: string;
    burnAddress: string;
  };
  templateRules: string;
  templateRuleHelp: string;
  templateItems: readonly DisclosureRow[];
  dataStatus: string;
  dataStatusHelp: string;
  dataItems: readonly DisclosureRow[];
  wallet: string;
  walletItems: readonly string[];
  source: string;
  sourceText: string;
  lpProof: string;
  lpProofText: string;
  verifyBurnAddress: string;
  report: string;
};

export const announcementCopy: Record<Language, string> = {
  zh: "BNBX.MEME 是 BNB Chain 上的联合曲线代币发射平台，公开展示创建费、模板税费与正式合约，支持创建和交易社区代币。",
  en: "BNBX.MEME is a bonding-curve token launchpad on BNB Chain. Creation fees, template taxes, and official contracts are published for community token launches and trading.",
  ko: "BNBX.MEME는 BNB Chain의 본딩 커브 토큰 런치패드입니다. 커뮤니티 토큰 발행과 거래를 위한 생성 수수료, 템플릿 세금 및 공식 컨트랙트를 공개합니다.",
  ja: "BNBX.MEMEはBNB Chain上のボンディングカーブ型トークンローンチパッドです。コミュニティトークンの発行・取引に関する作成手数料、テンプレート税、公式コントラクトを公開します。",
};

export const securityCopy: Record<Language, SecurityCopy> = {
  zh: {
    eyebrow: "BNBX TRUST CENTER",
    title: "安全、费用与正式合约",
    lead: "本页公开 BNBX 正式域名、合约、费用和钱包交互规则。市场指标中的 0 表示数据已成功读取且数值确实为零；“—”或“暂不可用”表示尚未取得或无法验证。交易前请同时核对钱包预览与 BscScan。",
    domain: "唯一正式域名",
    contracts: "BNB Chain Mainnet 正式地址",
    fees: "平台固定费用",
    feeItems: [
      ["创建代币", "0.001 BNB"],
      ["内盘买入", "0.5%"],
      ["内盘卖出", "0.5%"],
      ["报价保护", "界面默认最低收到保护 1%"],
    ],
    factoryLabels: {
      standard: "标准 0 税 Factory",
      legacyStandard: "历史标准 0 税 Factory（只读）",
      autoLiquidity: "历史自动回流 Factory（只读）",
      rewards: "持币 / LP 分红 Factory",
      legacyRewards: "历史持币 / LP 分红 Factory（只读）",
      router: "PancakeSwap V2 Router",
      burnAddress: "LP 销毁地址",
    },
    templateRules: "模板税费上限",
    templateRuleHelp:
      "标准模板由合约强制永久 0 税。高级模板的买入侧和卖出侧各自最多 {cap}%；上限按销毁、加池、营销与分红之和计算，不是每一项各 {cap}%。",
    templateItems: [
      ["标准模板", "买入 0% · 卖出 0%"],
      ["持币分红", "买入合计 ≤ {cap}% · 卖出合计 ≤ {cap}%"],
      ["LP 分红", "买入合计 ≤ {cap}% · 卖出合计 ≤ {cap}%"],
    ],
    dataStatus: "数据状态定义",
    dataStatusHelp:
      "这些状态只说明数据是否成功读取，不代表项目安全性或投资结果。",
    dataItems: [
      ["0", "完整查询成功，精确结果为零，例如确实没有符合条件的持有人。"],
      ["—", "该指标尚未产生或不适用于当前阶段。"],
      ["暂不可用", "RPC、索引或链上验证暂时失败；应重试，不能推断为零。"],
    ],
    wallet: "钱包交互规则",
    walletItems: [
      "BNBX 永远不会索取助记词、私钥或钱包密码。",
      "创建、买入、授权和卖出只会在用户主动点击后请求钱包。",
      "创建前会展示交互合约、部署费、首购额、总发送额和最低收到。",
      "卖出首次授权后使用同一笔已锁定报价继续卖出；授权失败不会自动重试。",
    ],
    source: "链上验证说明",
    sourceText:
      "合约源码可在 BscScan 核验。源码验证提高透明度，但不等同于独立安全审计，也不保证代币价值或收益。",
    lpProof: "LP 销毁证明",
    lpProofText:
      "毕业时，BondingCurve 将官方 Pancake Pair 的 LP 直接铸造到销毁地址。项目页读取该 Pair 在销毁地址的 LP 余额；只有余额大于 0 才显示“永久销毁”，未毕业、未检测到和暂不可验证会分别显示。",
    verifyBurnAddress: "在 BscScan 查看销毁地址",
    report:
      "遇到钱包误报？请展开警告详情并保存警告类别与交易哈希，再联系官方社区。不要关闭钱包安全功能。",
  },
  en: {
    eyebrow: "BNBX TRUST CENTER",
    title: "Safety, fees and official contracts",
    lead: "This page publishes BNBX official domains, contracts, fees, and wallet interaction rules. A market metric of 0 means the data was read successfully and is exactly zero; “—” or “temporarily unavailable” means the value is not yet available or could not be verified. Check wallet previews and BscScan before trading.",
    domain: "Only official domains",
    contracts: "Official BNB Chain Mainnet addresses",
    fees: "Fixed platform fees",
    feeItems: [
      ["Token creation", "0.001 BNB"],
      ["Bonding-curve buy", "0.5%"],
      ["Bonding-curve sell", "0.5%"],
      ["Quote protection", "1% minimum-output protection by default"],
    ],
    factoryLabels: {
      standard: "Standard zero-tax Factory",
      legacyStandard: "Legacy standard zero-tax Factory (read only)",
      autoLiquidity: "Legacy auto-liquidity Factory (read only)",
      rewards: "Holder / LP rewards Factory",
      legacyRewards: "Legacy holder / LP rewards Factory (read only)",
      router: "PancakeSwap V2 Router",
      burnAddress: "LP burn address",
    },
    templateRules: "Template tax limits",
    templateRuleHelp:
      "The Standard template is permanently zero-tax at contract level. Advanced templates cap the combined buy side and combined sell side independently at {cap}%; the cap is shared across burn, liquidity, marketing, and rewards, not {cap}% per component.",
    templateItems: [
      ["Standard", "0% buy · 0% sell"],
      ["Holder Rewards", "≤ {cap}% total buy · ≤ {cap}% total sell"],
      ["LP Rewards", "≤ {cap}% total buy · ≤ {cap}% total sell"],
    ],
    dataStatus: "Data status definitions",
    dataStatusHelp:
      "These states describe data availability only; they are not safety or investment conclusions.",
    dataItems: [
      [
        "0",
        "The complete query succeeded and the exact result is zero, such as no eligible holders.",
      ],
      [
        "—",
        "The metric has not been produced yet or does not apply at this stage.",
      ],
      [
        "Temporarily unavailable",
        "RPC, indexing, or on-chain verification failed; retry instead of inferring zero.",
      ],
    ],
    wallet: "Wallet interaction rules",
    walletItems: [
      "BNBX never asks for a recovery phrase, private key, or wallet password.",
      "Wallet requests only follow an explicit create, buy, approve, or sell action.",
      "The contract, creation fee, initial buy, total value, and minimum output are shown before creation.",
      "A first sell approval continues with the locked order; failed approvals are never retried automatically.",
    ],
    source: "On-chain verification",
    sourceText:
      "Contract source can be checked on BscScan. Source verification improves transparency, but is not an independent audit and does not guarantee token value or returns.",
    lpProof: "LP burn proof",
    lpProofText:
      "At graduation, the BondingCurve mints the official Pancake Pair LP directly to the burn address. Each project page reads that Pair's LP balance at the burn address and labels it permanently burned only when the balance is greater than zero; pending, missing, and unverifiable states remain distinct.",
    verifyBurnAddress: "View the burn address on BscScan",
    report:
      "If a wallet warns incorrectly, expand the warning and save its category and transaction hash before contacting the official community. Do not disable wallet security.",
  },
  ko: {
    eyebrow: "BNBX TRUST CENTER",
    title: "보안, 수수료 및 공식 컨트랙트",
    lead: "BNBX 공식 도메인, 컨트랙트, 수수료와 지갑 상호작용 원칙을 공개합니다. 시장 지표의 0은 조회가 정상 완료되어 실제 값이 0이라는 뜻이며, “—” 또는 “일시적으로 이용 불가”는 아직 값이 없거나 검증할 수 없다는 뜻입니다. 거래 전 지갑 미리보기와 BscScan을 확인하세요.",
    domain: "유일한 공식 도메인",
    contracts: "BNB Chain Mainnet 공식 주소",
    fees: "플랫폼 고정 수수료",
    feeItems: [
      ["토큰 생성", "0.001 BNB"],
      ["본딩 커브 구매", "0.5%"],
      ["본딩 커브 판매", "0.5%"],
      ["호가 보호", "기본 최소 수령 보호 1%"],
    ],
    factoryLabels: {
      standard: "표준 0% 세금 Factory",
      legacyStandard: "레거시 표준 0% 세금 Factory (읽기 전용)",
      autoLiquidity: "레거시 자동 유동성 Factory (읽기 전용)",
      rewards: "홀더 / LP 보상 Factory",
      legacyRewards: "레거시 홀더 / LP 보상 Factory (읽기 전용)",
      router: "PancakeSwap V2 Router",
      burnAddress: "LP 소각 주소",
    },
    templateRules: "템플릿 세금 한도",
    templateRuleHelp:
      "표준 템플릿은 컨트랙트에서 영구 0% 세금으로 강제됩니다. 고급 템플릿은 구매 측과 판매 측 합계를 각각 최대 {cap}%로 제한하며, 소각·유동성·마케팅·보상의 합산 한도이지 항목별 {cap}%가 아닙니다.",
    templateItems: [
      ["표준", "구매 0% · 판매 0%"],
      ["홀더 보상", "구매 합계 ≤ {cap}% · 판매 합계 ≤ {cap}%"],
      ["LP 보상", "구매 합계 ≤ {cap}% · 판매 합계 ≤ {cap}%"],
    ],
    dataStatus: "데이터 상태 정의",
    dataStatusHelp:
      "이 상태는 데이터 조회 여부만 설명하며 프로젝트 안전성이나 투자 결과를 뜻하지 않습니다.",
    dataItems: [
      [
        "0",
        "전체 조회가 성공했고 적격 홀더가 없는 경우처럼 정확한 결과가 0입니다.",
      ],
      ["—", "아직 생성되지 않았거나 현재 단계에 적용되지 않는 지표입니다."],
      [
        "일시적으로 이용 불가",
        "RPC, 인덱싱 또는 온체인 검증에 실패했습니다. 0으로 추정하지 말고 다시 시도하세요.",
      ],
    ],
    wallet: "지갑 상호작용 원칙",
    walletItems: [
      "BNBX는 복구 문구, 개인 키 또는 지갑 비밀번호를 요구하지 않습니다.",
      "지갑 요청은 사용자가 생성, 구매, 승인 또는 판매를 직접 클릭한 뒤에만 발생합니다.",
      "생성 전 컨트랙트, 생성 수수료, 최초 구매, 총액과 최소 수령량을 표시합니다.",
      "최초 판매 승인은 고정된 주문으로 이어지며 실패한 승인은 자동 재시도하지 않습니다.",
    ],
    source: "온체인 검증",
    sourceText:
      "BscScan에서 컨트랙트 소스를 확인할 수 있습니다. 소스 검증은 투명성을 높이지만 독립 감사가 아니며 토큰 가치나 수익을 보장하지 않습니다.",
    lpProof: "LP 소각 증명",
    lpProofText:
      "졸업 시 BondingCurve는 공식 Pancake Pair LP를 소각 주소로 직접 발행합니다. 각 프로젝트 페이지는 해당 Pair의 소각 주소 LP 잔액을 읽고 잔액이 0보다 클 때만 영구 소각으로 표시하며, 대기·미검출·검증 불가 상태를 구분합니다.",
    verifyBurnAddress: "BscScan에서 소각 주소 확인",
    report:
      "지갑 오탐이 발생하면 경고 상세를 펼쳐 분류와 거래 해시를 저장한 뒤 공식 커뮤니티에 문의하세요. 지갑 보안 기능을 끄지 마세요.",
  },
  ja: {
    eyebrow: "BNBX TRUST CENTER",
    title: "安全性・手数料・公式コントラクト",
    lead: "BNBXの公式ドメイン、コントラクト、手数料、ウォレット連携ルールを公開します。市場指標の0は取得に成功し実値が0であることを示し、「—」または「一時的に利用不可」は未取得または検証不能を示します。取引前にウォレットのプレビューとBscScanを確認してください。",
    domain: "唯一の公式ドメイン",
    contracts: "BNB Chain Mainnet公式アドレス",
    fees: "プラットフォーム固定手数料",
    feeItems: [
      ["トークン作成", "0.001 BNB"],
      ["カーブ購入", "0.5%"],
      ["カーブ売却", "0.5%"],
      ["価格保護", "最低受取保護1%（初期値）"],
    ],
    factoryLabels: {
      standard: "標準0%税Factory",
      legacyStandard: "旧標準0%税Factory（読み取り専用）",
      autoLiquidity: "旧自動流動性Factory（読み取り専用）",
      rewards: "ホルダー / LP報酬Factory",
      legacyRewards: "旧ホルダー / LP報酬Factory（読み取り専用）",
      router: "PancakeSwap V2 Router",
      burnAddress: "LPバーンアドレス",
    },
    templateRules: "テンプレート税上限",
    templateRuleHelp:
      "標準テンプレートはコントラクトで永久0%税に固定されます。高機能テンプレートは購入側と売却側の合計をそれぞれ最大{cap}%に制限し、バーン・流動性・マーケティング・報酬の合算上限であって各項目{cap}%ではありません。",
    templateItems: [
      ["標準", "購入 0% · 売却 0%"],
      ["ホルダー報酬", "購入合計 ≤ {cap}% · 売却合計 ≤ {cap}%"],
      ["LP報酬", "購入合計 ≤ {cap}% · 売却合計 ≤ {cap}%"],
    ],
    dataStatus: "データ状態の定義",
    dataStatusHelp:
      "これらの状態はデータ取得状況のみを示し、プロジェクトの安全性や投資結果を示すものではありません。",
    dataItems: [
      [
        "0",
        "完全な取得に成功し、対象ホルダーがいない場合など正確な結果が0です。",
      ],
      ["—", "まだ生成されていない、または現在の段階に適用されない指標です。"],
      [
        "一時的に利用不可",
        "RPC、インデックス、オンチェーン検証に失敗しました。0と推定せず再試行してください。",
      ],
    ],
    wallet: "ウォレット連携ルール",
    walletItems: [
      "BNBXがリカバリーフレーズ、秘密鍵、ウォレットパスワードを求めることはありません。",
      "ウォレット要求は作成・購入・承認・売却をユーザーが明示的に操作した後だけ発生します。",
      "作成前にコントラクト、作成手数料、初回購入、合計送信額、最低受取量を表示します。",
      "初回売却承認後は固定した注文を続行し、失敗した承認を自動再試行しません。",
    ],
    source: "オンチェーン検証",
    sourceText:
      "BscScanでコントラクトソースを確認できます。ソース検証は透明性を高めますが独立監査ではなく、トークン価値や収益を保証しません。",
    lpProof: "LPバーン証明",
    lpProofText:
      "卒業時、BondingCurveは公式Pancake PairのLPをバーンアドレスへ直接発行します。各プロジェクトページはそのPairのバーンアドレス残高を読み、残高が0より大きい場合だけ永久バーンと表示し、待機・未検出・検証不能を区別します。",
    verifyBurnAddress: "BscScanでバーンアドレスを確認",
    report:
      "ウォレットの誤検知があれば、警告詳細を開き分類と取引ハッシュを保存して公式コミュニティへ連絡してください。セキュリティ機能は無効にしないでください。",
  },
};

export function resolveSecurityCopy(
  language: Language,
  taxCapPercent: number,
): SecurityCopy {
  const copy = securityCopy[language];
  const insertCap = (value: string) =>
    value.replaceAll("{cap}", String(taxCapPercent));

  return {
    ...copy,
    templateRuleHelp: insertCap(copy.templateRuleHelp),
    templateItems: copy.templateItems.map(([label, value]) => [
      label,
      insertCap(value),
    ]),
  };
}
