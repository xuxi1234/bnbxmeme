// Test launches remain immutable on BNB Chain, but these projects have been
// retired from the public BNBX catalog at the platform owner's request.
// Keep this list address-only so duplicate names can never hide a real launch.
export const hiddenTokenAddresses = [
  "0x0a4b4b0aa8a08392b3e9139e52144d4e7a281111", // BNBX0税测试
  "0x82e0e932829b4ad4410d12f72b9ed8e941aa1111", // BNBX持币分红模版
  "0x0b681fb52a7c07c1f169c1258a20a8ef77251111", // 0税2 测试
  "0x3d6a965e62fa5296591887402d16fede958e1111", // 0税测试4
  "0x7bf51b40780ef36e26ea69207cc09349d9f21111", // LP分红模版测试
  "0xb734ff869f738cc786a8b41cd411e4bcb4391111", // 持币分红测试2
] as const;

const hiddenTokenAddressSet = new Set<string>(hiddenTokenAddresses);

export function isHiddenTokenAddress(address: string) {
  return hiddenTokenAddressSet.has(address.toLowerCase());
}
