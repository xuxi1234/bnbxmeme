type AdvancedTemplateFactories = {
  autoLiquidity: string;
  rewards: string;
  legacyRewards: string;
  holderRewards: string;
  lpRewards: string;
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
    factories.lpRewards,
  ].some((candidate) => matchesFactory(factory, candidate));
}

type TaxTuple = readonly [number, number, number, number];

export function resolveTemplateTaxes({
  independentHolderRewards,
  buyTaxes,
  sellTaxes,
  buyRewardTaxBps,
  sellRewardTaxBps,
  holderBuyTaxes,
  holderSellTaxes,
}: {
  independentHolderRewards: boolean;
  buyTaxes?: TaxTuple;
  sellTaxes?: TaxTuple;
  buyRewardTaxBps?: number;
  sellRewardTaxBps?: number;
  holderBuyTaxes?: readonly [number, number, number];
  holderSellTaxes?: readonly [number, number, number];
}) {
  if (independentHolderRewards) {
    if (holderBuyTaxes && holderSellTaxes) {
      return {
        buy: [
          holderBuyTaxes[2],
          holderBuyTaxes[0],
          0,
          holderBuyTaxes[1],
        ] as TaxTuple,
        sell: [
          holderSellTaxes[2],
          holderSellTaxes[0],
          0,
          holderSellTaxes[1],
        ] as TaxTuple,
      };
    }
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
