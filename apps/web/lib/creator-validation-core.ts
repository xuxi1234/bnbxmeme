export type CreatorAddressState = "valid" | "invalid" | "zero";
export type CreatorCatalogState = "complete" | "partial" | "unavailable";

export type CreatorValidationInput = {
  address?: `0x${string}`;
  addressState: CreatorAddressState;
  catalogState: CreatorCatalogState;
  creators?: readonly `0x${string}`[];
};

export type CreatorValidationResult =
  | {
      status: "valid";
      address: `0x${string}`;
    }
  | {
      status: "not_found";
      reason: "invalid-address" | "zero-address" | "no-projects";
    }
  | {
      status: "unavailable";
      reason: "catalog-read-failed" | "catalog-incomplete";
      address: `0x${string}`;
    };

export function uniqueCreatorAddresses(creators: readonly `0x${string}`[]) {
  return [...new Set(creators.map((creator) => creator.toLowerCase()))];
}

export function classifyCreatorValidation(
  input: CreatorValidationInput,
): CreatorValidationResult {
  if (input.addressState === "invalid" || !input.address) {
    return { status: "not_found", reason: "invalid-address" };
  }
  if (input.addressState === "zero") {
    return { status: "not_found", reason: "zero-address" };
  }

  const normalizedAddress = input.address.toLowerCase();
  if (
    input.creators?.some(
      (creator) => creator.toLowerCase() === normalizedAddress,
    )
  ) {
    return { status: "valid", address: input.address };
  }

  if (input.catalogState === "unavailable") {
    return {
      status: "unavailable",
      reason: "catalog-read-failed",
      address: input.address,
    };
  }
  if (input.catalogState === "partial") {
    return {
      status: "unavailable",
      reason: "catalog-incomplete",
      address: input.address,
    };
  }

  return { status: "not_found", reason: "no-projects" };
}
