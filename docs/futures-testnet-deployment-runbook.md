# BNBX Futures Phase 1 — BSC Testnet Deployment Runbook

This runbook is intentionally limited to BSC Testnet (`chainId 97`). It must not be adapted to mainnet without a separate approved design and audit.

## Required secure configuration

Supply every variable listed in the Futures section of `.env.example`. Addresses must identify the intended Test USDT, Test BNBX, WBNB, Test BNBX/WBNB Pancake-compatible pair, BNB/USD test feed, guardian, and revenue recipient. The deployment wallet must hold at least `0.05` Test BNB. `DEPLOYER_PRIVATE_KEY` and `BSC_SCAN_API_KEY` must remain in a secure secret manager and must never use a `NEXT_PUBLIC_` prefix.

The pair must contain exactly Test BNBX and WBNB, and all three token contracts used by the oracle/collateral boundary must expose 18 decimals. The scripts do not contain fallback asset addresses.

## Ordered gates

Run from `packages/contracts`:

```bash
node --test scripts/futures-testnet-deployment.test.mjs
pnpm futures:build
pnpm futures:audit
pnpm futures:testnet:preflight
pnpm futures:testnet:deploy
pnpm futures:testnet:verify-source
pnpm futures:testnet:acceptance
```

The preflight first runs the deterministic Ganache deployment and compiles Solidity `0.8.30`, optimizer `200`, Shanghai. It then confirms chain 97, deployer balance, dependency bytecode, token decimals, pair identity and reserves, cumulative-price availability, and a positive/fresh BNB/USD round. The deploy command reruns this preflight itself before making any chain write.

The deployment uses five consecutive nonces in this exact order: RiskEngine, ClearingHouse, FuturesOracle, SafetyController, OrderBook. ClearingHouse and FuturesOracle receive the predicted immutable SafetyController/OrderBook addresses; there are no post-deploy setters. A manifest is written to `deployments/bsc-testnet-futures.json` only after all five receipts succeed, every predicted address matches, and every runtime is at most 24,576 bytes.

Source verification writes `deployments/bsc-testnet-futures-verification.json` only after all five standard-json submissions are verified. Acceptance independently binds each address to its successful deployment receipt, sender and nonce; checks live runtime hashes, sizes, immutable dependency wiring, the exact OrderBook EIP-712 domain separator, chain identity, oracle health, and explicit test assets.

## Preview handoff

Only after deployment, verification, and acceptance pass, copy these public values from the validated manifest into the Vercel Preview environment:

- `NEXT_PUBLIC_FUTURES_TEST_USDT` = manifest `assets.testUsdt`
- `NEXT_PUBLIC_FUTURES_ORDER_BOOK` = the OrderBook entry address
- `FUTURES_ORDER_BOOK` = the same OrderBook address
- `FUTURES_CHAIN_ID=97`
- `FUTURES_API_WRITES_ENABLED=true`

Keep session, Supabase, and service secrets server-only. Do not enable these values for Production. Deploy the feature branch as a Vercel Preview and run the Task 13 browser/API acceptance checks before giving the URL to testers.
