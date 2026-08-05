type AdvancedTemplateFactories = {
  autoLiquidity: string;
  rewards: string;
  legacyRewards: string;
  holderRewards: string;
};

function matchesFactory(factory: string, candidate: string) {
  return factory.toLowerCase() === candidate.toLowerCase();
}

export function isAdvancedTemplateFactory(
  factory: string,
  factories: AdvancedTemplateFactories,
) {
  return Object.values(factories).some((candidate) =>
    matchesFactory(factory, candidate),
  );
}

export function isRewardsTemplateFactory(
  factory: string,
  factories: AdvancedTemplateFactories,
) {
  return [
    factories.rewards,
    factories.legacyRewards,
    factories.holderRewards,
  ].some((candidate) => matchesFactory(factory, candidate));
}

type TaxTuple = readonly [number, number, number, number];

export function resolveTemplateTaxes({
  independentHolderRewards,
  buyTaxes,
  sellTaxes,
  buyRewardTaxBps,
  sellRewardTaxBps,
}: {
  independentHolderRewards: boolean;
  buyTaxes?: TaxTuple;
  sellTaxes?: TaxTuple;
  buyRewardTaxBps?: number;
  sellRewardTaxBps?: number;
}) {
  if (independentHolderRewards) {
    return {
      buy: [0, 0, 0, buyRewardTaxBps ?? 0] as TaxTuple,
      sell: [0, 0, 0, sellRewardTaxBps ?? 0] as TaxTuple,
    };
  }

  return {
    buy: buyTaxes ?? ([0, 0, 0, 0] as TaxTuple),
    sell: sellTaxes ?? ([0, 0, 0, 0] as TaxTuple),
  };
}
