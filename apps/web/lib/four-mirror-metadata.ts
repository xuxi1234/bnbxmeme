const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const MIRROR_OPERATOR_WALLET =
  "0x50ce802BC302Ba36CD91D26f4b3AafeB631806D3";

function limitedText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function safeHttps(value: unknown) {
  const raw = limitedText(value, 300);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeFourMirrorMetadata(source: Record<string, unknown>) {
  const mirrorDisclosure = limitedText(source.mirrorDisclosure, 100) || undefined;
  const sourcePlatform = limitedText(source.sourcePlatform, 50) || undefined;
  const rawSourceContract = limitedText(source.sourceContract, 42);
  const sourceContract = ADDRESS_PATTERN.test(rawSourceContract)
    ? rawSourceContract
    : undefined;
  const sourceUrl = safeHttps(source.sourceUrl);
  let description = limitedText(source.description, 500) || undefined;

  if (description && mirrorDisclosure && sourcePlatform && sourceContract) {
    const legacyPrefix = `${mirrorDisclosure}。原始 ${sourcePlatform} 合约：${sourceContract}`;
    if (description === legacyPrefix) {
      description = undefined;
    } else if (description.startsWith(`${legacyPrefix}。`)) {
      description = description.slice(legacyPrefix.length + 1).trim() || undefined;
    }
  }

  return {
    description,
    mirrorDisclosure,
    sourcePlatform,
    sourceContract,
    sourceUrl,
  };
}

export function shouldShowTokenDescriptionForCreator(creator?: string) {
  return creator?.toLowerCase() !== MIRROR_OPERATOR_WALLET.toLowerCase();
}
