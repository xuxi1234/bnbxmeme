# Flap Latest Graduated Mirror Deploy Design

## Goal

Add an isolated BNBX preview tool at `/flap-mirror-deploy` that discovers the newest graduated Flap.sh tokens on BSC and lets an authorized BNBX operator create selected community mirrors through the existing production zero-tax Factory.

## Scope and safety boundary

- Base: `main@088b2ee376482859434dc35b7c0247fd776b0850`.
- Source scope: BSC tokens whose Flap record has `listed: true` and numeric `progress: 100` only.
- Ordering: paginate up to five 20-row Flap board pages, then deduplicate, filter, sort by creation time, and show at most the newest 20 records per refresh.
- Excluded: Flap stocks, LISTADAO, gift tokens, testnets, non-BSC chains, bonding-curve projects, and records without a valid BSC token address.
- Route: `/flap-mirror-deploy`; it is not linked from public navigation.
- API routes: `/api/flap-mirrors`, `/api/flap-mirrors/session`, and `/api/flap-mirrors/prepare`, separate from the Four routes.
- Factory: the existing BNBX production zero-tax Factory from `zeroTaxFactoryAddress`.
- Creation: `createVanityToken` with the existing `0.001 BNB` Factory fee and `1111` suffix search.
- Wallet: use the same authorized operator-wallet allowlist as the Four tool. No private key is accepted, stored, or used.
- Delivery: a Draft PR and Vercel Preview only. No merge to `main`, Production release, contract deployment, or database migration.

## Architecture

The Flap adapter is independent from the Four adapter. `flap-mirror-core.ts` validates and normalizes Flap records, requires both graduation signals, resolves IPFS images, derives a stable 1–18 BNB graduation target, and converts market data and tax fields to display values. `flap-mirror-server.ts` reads Flap's current BSC public board data, keeps only the newest graduated records, enriches security warnings with GoPlus when available, and caches discovery for 60 seconds.

The wallet and queue mechanics reuse platform-neutral behavior already proven by the Four tool: authorized wallet checks, a gasless origin-bound operator-session signature reused until expiry, one automatic reauthentication attempt after a 401, sequential processing, one transaction confirmation per token, stop-on-wallet-rejection, and continue-on-metadata-or-vanity failure. Flap-specific request building and metadata remain separately named so source attribution cannot accidentally say Four.

## Discovery and display

Each result shows:

- Flap token name, symbol, logo, original contract, and source link.
- Market cap, 24-hour volume, liquidity, holder count, and buy/sell tax when present.
- A clear graduated status based on `listed: true` plus `progress: 100`.
- Yellow warnings for unavailable security data, low liquidity, low volume, low holder count, honeypot, mint, blacklist, proxy, hidden-owner, transfer, pause, sell, and external-call risks.

Warnings are informational and do not block selection because the BNBX mirror is a new independent zero-tax contract. Malformed records and non-graduated records are excluded rather than shown.

The operator can select individual results or all current results. The page displays `selected count × 0.001 BNB`; gas is separate.

## Metadata and attribution

Before each transaction, the prepare route requires a fingerprint- and origin-bound signed session from the shared authorized-wallet allowlist, applies a per-wallet/fingerprint rate limit, re-fetches the source record, verifies that it is still graduated, normalizes the name and symbol to Factory limits, pins the logo and metadata through the existing Pinata integration, and returns the metadata URI. A short single-flight cache prevents repeated requests from duplicating Pinata writes. Session signing requires `BNBX_MIRROR_SESSION_SECRET` or the existing dedicated `BNBX_AI_SESSION_SECRET`; it never reuses `PINATA_JWT` as an authentication secret.

Every metadata document states `社区镜像 / 非原项目官方发行`, identifies Flap.sh as the source platform, and stores the original Flap contract and source URL. If revalidation or metadata preparation fails, no transaction is requested for that item and the queue continues.

## Sequential wallet flow

1. Connect an authorized wallet on BSC mainnet.
2. Select one or more graduated Flap tokens.
3. For each selected token in displayed order, prepare metadata and search for a `1111` vanity salt.
4. Ask the wallet for one `createVanityToken` confirmation.
5. Wait for the receipt, decode `TokenCreated`, trigger the existing verification endpoint, and show BscScan and BNBX links.
6. Continue after failures that occur before a transaction is broadcast. Pause immediately after an explicit wallet rejection or after a broadcast whose receipt is uncertain, leaving remaining items unsent and retaining the transaction hash for reconciliation.

The page locks selection and submission controls while the queue is running, preventing duplicate sends.

## Error handling

- Flap discovery failure returns HTTP 502 with an empty list and a readable message.
- A single malformed source row is skipped without failing the whole refresh.
- GoPlus failure adds `security-unavailable` and keeps the item selectable.
- Image or metadata preparation failure prevents only that item's transaction.
- Image downloads enforce both `Content-Length` and streamed 2 MB limits; upstream and Pinata calls have bounded timeouts.
- An already-broadcast transaction with an unknown receipt is shown as submitted and pauses the queue to prevent duplicate mirrors.
- Wrong wallet, wrong chain, empty selection, and busy state are blocked before any write request.

## Testing and acceptance

- Core tests prove invalid addresses, non-BSC records, `listed !== true`, `progress !== 100`, IPFS image normalization, stable 1–18 targets, newest-first ordering, and warning derivation.
- Server tests use complete Flap fixtures and prove only graduated BSC rows survive, malformed rows are skipped, the maximum is 20, and source failures are handled.
- Prepare tests prove source revalidation and Flap-specific mirror attribution.
- Deployment tests prove the production zero-tax Factory, `createVanityToken`, `0.001 BNB`, BSC chain, Factory limits, and one request per queue item.
- Page acceptance tests prove the independent route/API names, disclosure copy, wallet guard, multi-select fee, and absence of any Four attribution.
- Final verification runs the full test suite, lint, TypeScript, production build, diff review, and secret-pattern scan, followed by real browser verification on the Vercel Preview.
