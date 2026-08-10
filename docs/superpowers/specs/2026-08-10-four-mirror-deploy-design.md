# Four Mirror Deploy Preview Design

## Goal

Create an isolated BNBX preview entry that discovers newly graduated Four.meme tokens, applies the approved balanced screening rules, and lets the authorized BNBX wallet deploy one selected community mirror through the current production zero-tax Factory with exactly one wallet transaction.

## Scope and safety boundary

- Base: `main@9c9492ce7881c43e8de43b835f5d2d883135b4d3`.
- Route: `/four-mirror-deploy`; it is not linked from the public site navigation.
- Factory: `0x26f43d62e1cfadc3d89ff0ffe58375ecbded7330` only.
- Authorized wallet: the existing BNBX admin signing wallet, defaulting to `0xbE37AB912De351B9312FA593C9f99e3279FDB0a2`.
- No private key is accepted, stored, or used by the browser or server.
- Every deploy button prepares one token and then calls `createVanityToken` once. Read-only HTTP and RPC calls may precede it, but only one wallet transaction is requested.
- No merge to `main`, production deployment, contract deployment, or database migration is included.

## Discovery and screening

The server reads Four.meme's current public token search endpoint with `status=TRADE`, `type=NEW`, and `listType=NOR_DEX`. It enriches candidates with the token detail endpoint, the highest-liquidity PancakeSwap pair from DexScreener, and the BSC token-security response from GoPlus.

A token is eligible only when all of these are true:

- Pancake liquidity is at least 10,000 USD.
- Pancake 24-hour volume is at least 20,000 USD.
- Holder count is at least 100.
- It is open source and is not a honeypot, mintable, blacklisted, buy-blocked, sell-all-blocked, hidden-owner, proxy, self-destructible, transfer-pausable, or externally controlled token.

External failures are fail-closed: the candidate remains visible with a reason but cannot be deployed. Results are cached briefly to control upstream request volume.

## Mirror identity and metadata

The BNBX name and symbol are normalized from Four.meme's `name` and `shortName` fields to the existing Factory limits. The graduation target is a deterministic, stable integer from 1 to 18 derived from the original contract address, so it does not change on refresh and needs no preview database migration.

Before the wallet transaction, the server revalidates the source and pins a normalized metadata document and logo to IPFS through the existing Pinata integration. The metadata visibly states “社区镜像 / 非原项目官方发行” and stores the original Four contract and source URL. A preparation failure prevents the transaction.

## Wallet flow

1. The user connects a BSC wallet.
2. The page rejects the wrong chain or a wallet other than the authorized BNBX admin wallet.
3. The user selects one eligible token and clicks deploy.
4. The client asks the server to prepare and pin metadata.
5. The client uses the existing Factory `findVanitySalt` read call to find a `1111` suffix.
6. The client sends one `createVanityToken` transaction with the existing 0.001 BNB creation fee and standard gas limit.
7. The page waits for the receipt, decodes `TokenCreated`, triggers the existing verification endpoint, and shows the BscScan and BNBX token links.

The button is locked while preparation, vanity search, wallet confirmation, or receipt confirmation is active, preventing duplicate submissions from one click.

## Testing and verification

- Unit tests cover Four response normalization, stable 1-18 targets, metric selection, risk rejection, and eligibility reasons.
- Transaction-request tests prove the Factory address, function name, fee, and one-request-per-token contract.
- Route/page acceptance tests verify the mirror disclosure, authorized-wallet guard, and absence of batch-deploy behavior.
- Final verification runs the full test suite, lint, TypeScript typecheck, production build, git diff review, and secret-pattern scan.

