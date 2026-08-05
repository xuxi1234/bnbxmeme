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
