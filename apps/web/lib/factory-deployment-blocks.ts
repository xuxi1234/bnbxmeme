const MAINNET_FACTORY_DEPLOYMENT_BLOCKS = new Map<string, bigint>([
  ["0xdb189396ae2a350c484ddd749a6af96baebc124b", 112_395_295n],
  ["0x9f572dc9d582ec8347d2a803f766652982220539", 112_395_524n],
  ["0xde844f36a3bab42ae23158de5c3e8f0ac31e6af8", 112_626_381n],
  ["0xef95ead95292408090e61112580f62e4d556c550", 113_231_587n],
  ["0xc5f6d2b221dfd950f919b82c77d82fc427f31b3d", 113_235_314n],
  ["0xe4aaf8066bf1063cfd73dc9a784598dffa412014", 113_775_105n],
  ["0x6012aa2eb5164c8ed31f2a01950c3b5037211181", 113_777_341n],
]);

function parseConfiguredBlock(value: string | undefined) {
  return value && /^\d+$/.test(value) ? BigInt(value) : null;
}

export function resolveFactoryDeploymentBlock(
  factory: `0x${string}`,
  configuredFallback = process.env.NEXT_PUBLIC_BNBX_DEPLOYMENT_BLOCK,
) {
  const mainnetBlock = MAINNET_FACTORY_DEPLOYMENT_BLOCKS.get(
    factory.toLowerCase(),
  );
  if (mainnetBlock !== undefined) return mainnetBlock;

  // Environment overrides are intentionally limited to unknown/test
  // factories. Production Factory origins are immutable chain facts
  // and must not silently regress to a recent-block window.
  return parseConfiguredBlock(configuredFallback);
}
