type Address = `0x${string}`;

type SecurityAddressLabels = {
  standard: string;
  holderRewards: string;
  lpRewards: string;
  legacyStandard: string;
  autoLiquidity: string;
  legacyRewards: string;
  router: string;
  burnAddress: string;
};

type SecurityAddresses = {
  standard: Address;
  holderRewards: Address;
  lpRewards: Address;
  legacyStandard: Address;
  autoLiquidity: Address;
  rewards: Address;
  legacyRewards: Address;
  router: Address;
  burnAddress: Address;
};

type AddressEntry = {
  label: string;
  address: Address;
  sourceCode: boolean;
};

function uniqueByAddress(entries: AddressEntry[]) {
  return entries.filter(
    (entry, index) =>
      entries.findIndex(
        (candidate) =>
          candidate.address.toLowerCase() === entry.address.toLowerCase(),
      ) === index,
  );
}

export function buildSecurityAddressGroups(
  labels: SecurityAddressLabels,
  addresses: SecurityAddresses,
) {
  const activeFactories = uniqueByAddress([
    {
      label: labels.standard,
      address: addresses.standard,
      sourceCode: true,
    },
    {
      label: labels.holderRewards,
      address: addresses.holderRewards,
      sourceCode: true,
    },
    {
      label: labels.lpRewards,
      address: addresses.lpRewards,
      sourceCode: true,
    },
  ]);
  const activeAddresses = new Set(
    activeFactories.map(({ address }) => address.toLowerCase()),
  );
  const historicalFactories = uniqueByAddress([
    {
      label: labels.legacyRewards,
      address: addresses.rewards,
      sourceCode: true,
    },
    {
      label: labels.legacyStandard,
      address: addresses.legacyStandard,
      sourceCode: true,
    },
    {
      label: labels.autoLiquidity,
      address: addresses.autoLiquidity,
      sourceCode: true,
    },
    {
      label: labels.legacyRewards,
      address: addresses.legacyRewards,
      sourceCode: true,
    },
  ]).filter(({ address }) => !activeAddresses.has(address.toLowerCase()));

  return {
    activeFactories,
    historicalFactories,
    infrastructure: [
      {
        label: labels.router,
        address: addresses.router,
        sourceCode: true,
      },
      {
        label: labels.burnAddress,
        address: addresses.burnAddress,
        sourceCode: false,
      },
    ],
  };
}
