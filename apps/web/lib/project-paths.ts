export function tokenProjectPath(address: string) {
  return `/token/${address.toLowerCase()}`;
}

export function creatorProjectPath(address: string) {
  return `/creator/${address.toLowerCase()}`;
}

export function isCanonicalProjectAddress(
  requestedAddress: string,
  validatedAddress: string,
) {
  return requestedAddress === validatedAddress.toLowerCase();
}
