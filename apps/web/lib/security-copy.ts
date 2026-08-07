import type { Language } from "@/components/language-provider";

type DisclosureRow = readonly [label: string, value: string];

type SecurityCopy = {
  eyebrow: string;
  title: string;
  lead: string;
  domain: string;
  contracts: string;
  historicalContracts: string;
  fees: string;
  feeItems: readonly DisclosureRow[];
  factoryLabels: {
    standard: string;
    holderRewards: string;
    lpRewards: string;
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
  zh: "ä¸ä¸ªæ³æ³ï¼ä¸ä¸ªç¤¾åºï¼ä¸æä»£å¸ãå¨ BNBX.MEME ä½é¨æ§å¯å¨ä½ çç¤¾åºä»£å¸ï¼è´¹ç¨ä¸è§åå¬å¼éæï¼è¾¾æ åèªå¨è¿å¥ PancakeSwapã",
  en: "One idea, one community, one token. Launch your community token on BNBX.MEME with a low barrier to entry, transparent fees and rules, and automatic migration to PancakeSwap once the target is reached.",
  ko: "íëì ìì´ëì´, íëì ì»¤ë®¤ëí°, íëì í í°. BNBX.MEMEìì ë®ì ì§ì ì¥ë²½ì¼ë¡ ì»¤ë®¤ëí° í í°ì ì¶ìíì¸ì. ììë£ì ê·ì¹ì í¬ëªíê² ê³µê°ëë©°, ëª©í ë¬ì± í PancakeSwapì¼ë¡ ìë ì íë©ëë¤.",
  ja: "ã²ã¨ã¤ã®ã¢ã¤ãã¢ãã²ã¨ã¤ã®ã³ãã¥ããã£ãã²ã¨ã¤ã®ãã¼ã¯ã³ãBNBX.MEMEãªãä½ãåå¥éå£ã§ã³ãã¥ããã£ãã¼ã¯ã³ãå§ãããã¾ããææ°æã¨ã«ã¼ã«ã¯éæã«å¬éãããç®æ¨éæå¾ã¯PancakeSwapã¸èªåç§»è¡ãã¾ãã",
};

export const securityCopy: Record<Language, SecurityCopy> = {
  zh: {
    eyebrow: "BNBX TRUST CENTER",
    title: "å®å¨ãè´¹ç¨ä¸æ­£å¼åçº¦",
    lead: "æ¬é¡µå¬å¼ BNBX æ­£å¼ååãåçº¦ãè´¹ç¨åé±åäº¤äºè§åãå¸åºææ ä¸­ç 0 è¡¨ç¤ºæ°æ®å·²æåè¯»åä¸æ°å¼ç¡®å®ä¸ºé¶ï¼âââæâæä¸å¯ç¨âè¡¨ç¤ºå°æªåå¾ææ æ³éªè¯ãäº¤æåè¯·åæ¶æ ¸å¯¹é±åé¢è§ä¸ BscScanã",
    domain: "å¹³å°äºå¤§å®ç½",
    contracts: "BNB Chain Mainnet æ­£å¼å°å",
    historicalContracts: "åå² Factoryï¼åªè¯»ï¼",
    fees: "å¹³å°åºå®è´¹ç¨",
    feeItems: [
      ["åå»ºä»£å¸", "0.001 BNB"],
      ["æ°å¸åçä¹°å¥", "1%"],
      ["æ°å¸åçååº", "1%"],
      ["æ¥ä»·ä¿æ¤", "çé¢é»è®¤æä½æ¶å°ä¿æ¤ 1%"],
    ],
    factoryLabels: {
      standard: "æ å 0 ç¨ Factory",
      holderRewards: "æå¸åçº¢ Factory",
      lpRewards: "LP åçº¢ Factory",
      legacyStandard: "åå²æ å 0 ç¨ Factoryï¼åªè¯»ï¼",
      autoLiquidity: "åå²èªå¨åæµ Factoryï¼åªè¯»ï¼",
      rewards: "åå²æå¸ / LP åçº¢ Factoryï¼åªè¯»ï¼",
      legacyRewards: "åå²æå¸ / LP åçº¢ Factoryï¼åªè¯»ï¼",
      router: "PancakeSwap V2 Router",
      burnAddress: "LP éæ¯å°å",
    },
    templateRules: "æ¨¡æ¿ç¨è´¹ä¸é",
    templateRuleHelp:
      "æ åæ¨¡æ¿ç±åçº¦å¼ºå¶æ°¸ä¹ 0 ç¨ãé«çº§æ¨¡æ¿çä¹°å¥ä¾§åååºä¾§åèªæå¤ {cap}%ï¼ä¸éæéæ¯ãå æ± ãè¥éä¸åçº¢ä¹åè®¡ç®ï¼ä¸æ¯æ¯ä¸é¡¹å {cap}%ã",
    templateItems: [
      ["æ åæ¨¡æ¿", "ä¹°å¥ 0% Â· ååº 0%"],
      ["æå¸åçº¢", "ä¹°å¥åè®¡ â¤ {cap}% Â· ååºåè®¡ â¤ {cap}%"],
      ["LP åçº¢", "ä¹°å¥åè®¡ â¤ {cap}% Â· ååºåè®¡ â¤ {cap}%"],
    ],
    dataStatus: "æ°æ®ç¶æå®ä¹",
    dataStatusHelp:
      "è¿äºç¶æåªè¯´ææ°æ®æ¯å¦æåè¯»åï¼ä¸ä»£è¡¨é¡¹ç®å®å¨æ§ææèµç»æã",
    dataItems: [
      ["0", "å®æ´æ¥è¯¢æåï¼ç²¾ç¡®ç»æä¸ºé¶ï¼ä¾å¦ç¡®å®æ²¡æç¬¦åæ¡ä»¶çææäººã"],
      ["â", "è¯¥ææ å°æªäº§çæä¸éç¨äºå½åé¶æ®µã"],
      ["æä¸å¯ç¨", "RPCãç´¢å¼æé¾ä¸éªè¯ææ¶å¤±è´¥ï¼åºéè¯ï¼ä¸è½æ¨æ­ä¸ºé¶ã"],
    ],
    wallet: "é±åäº¤äºè§å",
    walletItems: [
      "BNBX æ°¸è¿ä¸ä¼ç´¢åå©è®°è¯ãç§é¥æé±åå¯ç ã",
      "åå»ºãä¹°å¥ãææåååºåªä¼å¨ç¨æ·ä¸»å¨ç¹å»åè¯·æ±é±åã",
      "åå»ºåä¼å±ç¤ºäº¤äºåçº¦ãé¨ç½²è´¹ãé¦è´­é¢ãæ»åéé¢åæä½æ¶å°ã",
      "ååºé¦æ¬¡ææåä½¿ç¨åä¸ç¬å·²éå®æ¥ä»·ç»§ç»­ååºï¼ææå¤±è´¥ä¸ä¼èªå¨éè¯ã",
    ],
    source: "é¾ä¸éªè¯è¯´æ",
    sourceText:
      "åçº¦æºç å¯å¨ BscScan æ ¸éªãæºç éªè¯æé«éæåº¦ï¼ä½ä¸ç­åäºç¬ç«å®å¨å®¡è®¡ï¼ä¹ä¸ä¿è¯ä»£å¸ä»·å¼ææ¶çã",
    lpProof: "LP éæ¯è¯æ",
    lpProofText:
      "æ¯ä¸æ¶ï¼BondingCurve å°å®æ¹ Pancake Pair ç LP ç´æ¥é¸é å°éæ¯å°åãé¡¹ç®é¡µè¯»åè¯¥ Pair å¨éæ¯å°åç LP ä½é¢ï¼åªæä½é¢å¤§äº 0 ææ¾ç¤ºâæ°¸ä¹éæ¯âï¼æªæ¯ä¸ãæªæ£æµå°åæä¸å¯éªè¯ä¼åå«æ¾ç¤ºã",
    verifyBurnAddress: "å¨ BscScan æ¥çéæ¯å°å",
    report:
      "éå°é±åè¯¯æ¥ï¼è¯·å±å¼è­¦åè¯¦æå¹¶ä¿å­è­¦åç±»å«ä¸äº¤æåå¸ï¼åèç³»å®æ¹ç¤¾åºãä¸è¦å³é­é±åå®å¨åè½ã",
  },
  en: {
    eyebrow: "BNBX TRUST CENTER",
    title: "Safety, fees and official contracts",
    lead: "This page publishes BNBX official domains, contracts, fees, and wallet interaction rules. A market metric of 0 means the data was read successfully and is exactly zero; âââ or âtemporarily unavailableâ means the value is not yet available or could not be verified. Check wallet previews and BscScan before trading.",
    domain: "Five official platform domains",
    contracts: "Official BNB Chain Mainnet addresses",
    historicalContracts: "Historical Factories (read only)",
    fees: "Fixed platform fees",
    feeItems: [
      ["Token creation", "0.001 BNB"],
      ["New-launch curve buy", "1%"],
      ["New-launch curve sell", "1%"],
      ["Quote protection", "1% minimum-output protection by default"],
    ],
    factoryLabels: {
      standard: "Standard zero-tax Factory",
      holderRewards: "Holder rewards Factory",
      lpRewards: "LP rewards Factory",
      legacyStandard: "Legacy standard zero-tax Factory (read only)",
      autoLiquidity: "Legacy auto-liquidity Factory (read only)",
      rewards: "Historical holder / LP rewards Factory (read only)",
      legacyRewards: "Legacy holder / LP rewards Factory (read only)",
      router: "PancakeSwap V2 Router",
      burnAddress: "LP burn address",
    },
    templateRules: "Template tax limits",
    templateRuleHelp:
      "The Standard template is permanently zero-tax at contract level. Advanced templates cap the combined buy side and combined sell side independently at {cap}%; the cap is shared across burn, liquidity, marketing, and rewards, not {cap}% per component.",
    templateItems: [
      ["Standard", "0% buy Â· 0% sell"],
      ["Holder Rewards", "â¤ {cap}% total buy Â· â¤ {cap}% total sell"],
      ["LP Rewards", "â¤ {cap}% total buy Â· â¤ {cap}% total sell"],
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
        "â",
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
    title: "ë³´ì, ììë£ ë° ê³µì ì»¨í¸ëí¸",
    lead: "BNBX ê³µì ëë©ì¸, ì»¨í¸ëí¸, ììë£ì ì§ê° ìí¸ìì© ìì¹ì ê³µê°í©ëë¤. ìì¥ ì§íì 0ì ì¡°íê° ì ì ìë£ëì´ ì¤ì  ê°ì´ 0ì´ë¼ë ë»ì´ë©°, âââ ëë âì¼ìì ì¼ë¡ ì´ì© ë¶ê°âë ìì§ ê°ì´ ìê±°ë ê²ì¦í  ì ìë¤ë ë»ìëë¤. ê±°ë ì  ì§ê° ë¯¸ë¦¬ë³´ê¸°ì BscScanì íì¸íì¸ì.",
    domain: "íë«í¼ ê³µì ëë©ì¸ 5ê°",
    contracts: "BNB Chain Mainnet ê³µì ì£¼ì",
    historicalContracts: "ë ê±°ì Factory (ì½ê¸° ì ì©)",
    fees: "íë«í¼ ê³ ì  ììë£",
    feeItems: [
      ["í í° ìì±", "0.001 BNB"],
      ["ì ê· ì»¤ë¸ êµ¬ë§¤", "1%"],
      ["ì ê· ì»¤ë¸ íë§¤", "1%"],
      ["í¸ê° ë³´í¸", "ê¸°ë³¸ ìµì ìë ¹ ë³´í¸ 1%"],
    ],
    factoryLabels: {
      standard: "íì¤ 0% ì¸ê¸ Factory",
      holderRewards: "íë ë³´ì Factory",
      lpRewards: "LP ë³´ì Factory",
      legacyStandard: "ë ê±°ì íì¤ 0% ì¸ê¸ Factory (ì½ê¸° ì ì©)",
      autoLiquidity: "ë ê±°ì ìë ì ëì± Factory (ì½ê¸° ì ì©)",
      rewards: "ë ê±°ì íë / LP ë³´ì Factory (ì½ê¸° ì ì©)",
      legacyRewards: "ë ê±°ì íë / LP ë³´ì Factory (ì½ê¸° ì ì©)",
      router: "PancakeSwap V2 Router",
      burnAddress: "LP ìê° ì£¼ì",
    },
    templateRules: "ííë¦¿ ì¸ê¸ íë",
    templateRuleHelp:
      "íì¤ ííë¦¿ì ì»¨í¸ëí¸ìì ìêµ¬ 0% ì¸ê¸ì¼ë¡ ê°ì ë©ëë¤. ê³ ê¸ ííë¦¿ì êµ¬ë§¤ ì¸¡ê³¼ íë§¤ ì¸¡ í©ê³ë¥¼ ê°ê° ìµë {cap}%ë¡ ì ííë©°, ìê°Â·ì ëì±Â·ë§ì¼íÂ·ë³´ìì í©ì° íëì´ì§ í­ëª©ë³ {cap}%ê° ìëëë¤.",
    templateItems: [
      ["íì¤", "êµ¬ë§¤ 0% Â· íë§¤ 0%"],
      ["íë ë³´ì", "êµ¬ë§¤ í©ê³ â¤ {cap}% Â· íë§¤ í©ê³ â¤ {cap}%"],
      ["LP ë³´ì", "êµ¬ë§¤ í©ê³ â¤ {cap}% Â· íë§¤ í©ê³ â¤ {cap}%"],
    ],
    dataStatus: "ë°ì´í° ìí ì ì",
    dataStatusHelp:
      "ì´ ìíë ë°ì´í° ì¡°í ì¬ë¶ë§ ì¤ëªíë©° íë¡ì í¸ ìì ì±ì´ë í¬ì ê²°ê³¼ë¥¼ ë»íì§ ììµëë¤.",
    dataItems: [
      [
        "0",
        "ì ì²´ ì¡°íê° ì±ê³µíê³  ì ê²© íëê° ìë ê²½ì°ì²ë¼ ì íí ê²°ê³¼ê° 0ìëë¤.",
      ],
      ["â", "ìì§ ìì±ëì§ ììê±°ë íì¬ ë¨ê³ì ì ì©ëì§ ìë ì§íìëë¤."],
      [
        "ì¼ìì ì¼ë¡ ì´ì© ë¶ê°",
        "RPC, ì¸ë±ì± ëë ì¨ì²´ì¸ ê²ì¦ì ì¤í¨íìµëë¤. 0ì¼ë¡ ì¶ì íì§ ë§ê³  ë¤ì ìëíì¸ì.",
      ],
    ],
    wallet: "ì§ê° ìí¸ìì© ìì¹",
    walletItems: [
      "BNBXë ë³µêµ¬ ë¬¸êµ¬, ê°ì¸ í¤ ëë ì§ê° ë¹ë°ë²í¸ë¥¼ ìêµ¬íì§ ììµëë¤.",
      "ì§ê° ìì²­ì ì¬ì©ìê° ìì±, êµ¬ë§¤, ì¹ì¸ ëë íë§¤ë¥¼ ì§ì  í´ë¦­í ë¤ìë§ ë°ìí©ëë¤.",
      "ìì± ì  ì»¨í¸ëí¸, ìì± ììë£, ìµì´ êµ¬ë§¤, ì´ì¡ê³¼ ìµì ìë ¹ëì íìí©ëë¤.",
      "ìµì´ íë§¤ ì¹ì¸ì ê³ ì ë ì£¼ë¬¸ì¼ë¡ ì´ì´ì§ë©° ì¤í¨í ì¹ì¸ì ìë ì¬ìëíì§ ììµëë¤.",
    ],
    source: "ì¨ì²´ì¸ ê²ì¦",
    sourceText:
      "BscScanìì ì»¨í¸ëí¸ ìì¤ë¥¼ íì¸í  ì ììµëë¤. ìì¤ ê²ì¦ì í¬ëªì±ì ëì´ì§ë§ ëë¦½ ê°ì¬ê° ìëë©° í í° ê°ì¹ë ììµì ë³´ì¥íì§ ììµëë¤.",
    lpProof: "LP ìê° ì¦ëª",
    lpProofText:
      "ì¡¸ì ì BondingCurveë ê³µì Pancake Pair LPë¥¼ ìê° ì£¼ìë¡ ì§ì  ë°íí©ëë¤. ê° íë¡ì í¸ íì´ì§ë í´ë¹ Pairì ìê° ì£¼ì LP ìì¡ì ì½ê³  ìì¡ì´ 0ë³´ë¤ í´ ëë§ ìêµ¬ ìê°ì¼ë¡ íìíë©°, ëê¸°Â·ë¯¸ê²ì¶Â·ê²ì¦ ë¶ê° ìíë¥¼ êµ¬ë¶í©ëë¤.",
    verifyBurnAddress: "BscScanìì ìê° ì£¼ì íì¸",
    report:
      "ì§ê° ì¤íì´ ë°ìíë©´ ê²½ê³  ìì¸ë¥¼ í¼ì³ ë¶ë¥ì ê±°ë í´ìë¥¼ ì ì¥í ë¤ ê³µì ì»¤ë®¤ëí°ì ë¬¸ìíì¸ì. ì§ê° ë³´ì ê¸°ë¥ì ëì§ ë§ì¸ì.",
  },
  ja: {
    eyebrow: "BNBX TRUST CENTER",
    title: "å®å¨æ§ã»ææ°æã»å¬å¼ã³ã³ãã©ã¯ã",
    lead: "BNBXã®å¬å¼ãã¡ã¤ã³ãã³ã³ãã©ã¯ããææ°æãã¦ã©ã¬ããé£æºã«ã¼ã«ãå¬éãã¾ããå¸å ´ææ¨ã®0ã¯åå¾ã«æåãå®å¤ã0ã§ãããã¨ãç¤ºãããâãã¾ãã¯ãä¸æçã«å©ç¨ä¸å¯ãã¯æªåå¾ã¾ãã¯æ¤è¨¼ä¸è½ãç¤ºãã¾ããåå¼åã«ã¦ã©ã¬ããã®ãã¬ãã¥ã¼ã¨BscScanãç¢ºèªãã¦ãã ããã",
    domain: "ãã©ãããã©ã¼ã ã®å¬å¼5ãã¡ã¤ã³",
    contracts: "BNB Chain Mainnetå¬å¼ã¢ãã¬ã¹",
    historicalContracts: "æ§Factoryï¼èª­ã¿åãå°ç¨ï¼",
    fees: "ãã©ãããã©ã¼ã åºå®ææ°æ",
    feeItems: [
      ["ãã¼ã¯ã³ä½æ", "0.001 BNB"],
      ["æ°è¦ã«ã¼ãè³¼å¥", "1%"],
      ["æ°è¦ã«ã¼ãå£²å´", "1%"],
      ["ä¾¡æ ¼ä¿è­·", "æä½ååä¿è­·1%ï¼åæå¤ï¼"],
    ],
    factoryLabels: {
      standard: "æ¨æº0%ç¨Factory",
      holderRewards: "ãã«ãã¼å ±é¬Factory",
      lpRewards: "LPå ±é¬Factory",
      legacyStandard: "æ§æ¨æº0%ç¨Factoryï¼èª­ã¿åãå°ç¨ï¼",
      autoLiquidity: "æ§èªåæµåæ§Factoryï¼èª­ã¿åãå°ç¨ï¼",
      rewards: "æ§ãã«ãã¼ / LPå ±é¬Factoryï¼èª­ã¿åãå°ç¨ï¼",
      legacyRewards: "æ§ãã«ãã¼ / LPå ±é¬Factoryï¼èª­ã¿åãå°ç¨ï¼",
      router: "PancakeSwap V2 Router",
      burnAddress: "LPãã¼ã³ã¢ãã¬ã¹",
    },
    templateRules: "ãã³ãã¬ã¼ãç¨ä¸é",
    templateRuleHelp:
      "æ¨æºãã³ãã¬ã¼ãã¯ã³ã³ãã©ã¯ãã§æ°¸ä¹0%ç¨ã«åºå®ããã¾ããé«æ©è½ãã³ãã¬ã¼ãã¯è³¼å¥å´ã¨å£²å´å´ã®åè¨ãããããæå¤§{cap}%ã«å¶éãããã¼ã³ã»æµåæ§ã»ãã¼ã±ãã£ã³ã°ã»å ±é¬ã®åç®ä¸éã§ãã£ã¦åé ç®{cap}%ã§ã¯ããã¾ããã",
    templateItems: [
      ["æ¨æº", "è³¼å¥ 0% Â· å£²å´ 0%"],
      ["ãã«ãã¼å ±é¬", "è³¼å¥åè¨ â¤ {cap}% Â· å£²å´åè¨ â¤ {cap}%"],
      ["LPå ±é¬", "è³¼å¥åè¨ â¤ {cap}% Â· å£²å´åè¨ â¤ {cap}%"],
    ],
    dataStatus: "ãã¼ã¿ç¶æã®å®ç¾©",
    dataStatusHelp:
      "ãããã®ç¶æã¯ãã¼ã¿åå¾ç¶æ³ã®ã¿ãç¤ºãããã­ã¸ã§ã¯ãã®å®å¨æ§ãæè³çµæãç¤ºããã®ã§ã¯ããã¾ããã",
    dataItems: [
      [
        "0",
        "å®å¨ãªåå¾ã«æåããå¯¾è±¡ãã«ãã¼ãããªãå ´åãªã©æ­£ç¢ºãªçµæã0ã§ãã",
      ],
      ["â", "ã¾ã çæããã¦ããªããã¾ãã¯ç¾å¨ã®æ®µéã«é©ç¨ãããªãææ¨ã§ãã"],
      [
        "ä¸æçã«å©ç¨ä¸å¯",
        "RPCãã¤ã³ããã¯ã¹ããªã³ãã§ã¼ã³æ¤è¨¼ã«å¤±æãã¾ããã0ã¨æ¨å®ããåè©¦è¡ãã¦ãã ããã",
      ],
    ],
    wallet: "ã¦ã©ã¬ããé£æºã«ã¼ã«",
    walletItems: [
      "BNBXããªã«ããªã¼ãã¬ã¼ãºãç§å¯éµãã¦ã©ã¬ãããã¹ã¯ã¼ããæ±ãããã¨ã¯ããã¾ããã",
      "ã¦ã©ã¬ããè¦æ±ã¯ä½æã»è³¼å¥ã»æ¿èªã»å£²å´ãã¦ã¼ã¶ã¼ãæç¤ºçã«æä½ããå¾ã ãçºçãã¾ãã",
      "ä½æåã«ã³ã³ãã©ã¯ããä½æææ°æãååè³¼å¥ãåè¨éä¿¡é¡ãæä½ååéãè¡¨ç¤ºãã¾ãã",
      "ååå£²å´æ¿èªå¾ã¯åºå®ããæ³¨æãç¶è¡ããå¤±æããæ¿èªãèªååè©¦è¡ãã¾ããã",
    ],
    source: "ãªã³ãã§ã¼ã³æ¤è¨¼",
    sourceText:
      "BscScanã§ã³ã³ãã©ã¯ãã½ã¼ã¹ãç¢ºèªã§ãã¾ããã½ã¼ã¹æ¤è¨¼ã¯éææ§ãé«ãã¾ããç¬ç«ç£æ»ã§ã¯ãªãããã¼ã¯ã³ä¾¡å¤ãåçãä¿è¨¼ãã¾ããã",
    lpProof: "LPãã¼ã³è¨¼æ",
    lpProofText:
      "åæ¥­æãBondingCurveã¯å¬å¼Pancake Pairã®LPããã¼ã³ã¢ãã¬ã¹ã¸ç´æ¥çºè¡ãã¾ããåãã­ã¸ã§ã¯ããã¼ã¸ã¯ãã®Pairã®ãã¼ã³ã¢ãã¬ã¹æ®é«ãèª­ã¿ãæ®é«ã0ããå¤§ããå ´åã ãæ°¸ä¹ãã¼ã³ã¨è¡¨ç¤ºããå¾æ©ã»æªæ¤åºã»æ¤è¨¼ä¸è½ãåºå¥ãã¾ãã",
    verifyBurnAddress: "BscScanã§ãã¼ã³ã¢ãã¬ã¹ãç¢ºèª",
    report:
      "ã¦ã©ã¬ããã®èª¤æ¤ç¥ãããã°ãè­¦åè©³ç´°ãéãåé¡ã¨åå¼ããã·ã¥ãä¿å­ãã¦å¬å¼ã³ãã¥ããã£ã¸é£çµ¡ãã¦ãã ãããã»ã­ã¥ãªãã£æ©è½ã¯ç¡å¹ã«ããªãã§ãã ããã",
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
