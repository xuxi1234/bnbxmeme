# BNBX Testnet deployment runbook

## 1. Prepare the deployer

- Use a dedicated Testnet-only wallet.
- Fund it with at least 0.05 tBNB for Factory deployment and gas.
- If the optional real graduation smoke test will run, fund at least 1.05 tBNB.
- Never reuse a mainnet treasury or personal high-value wallet private key.

## 2. Add GitHub Environment secrets

In the GitHub repository:

1. Open **Settings → Environments**.
2. Create an environment named `testnet`.
3. Add these environment secrets:
   - `BSC_TESTNET_RPC_URL`
   - `DEPLOYER_PRIVATE_KEY`
   - `BSC_SCAN_API_KEY`
4. Optionally require manual approval for this environment.

Do not put any of these values in repository variables, workflow files, issues, chat,
or screenshots.

## 3. Run the workflow

1. Open **Actions → Deploy BNBX Testnet**.
2. Select **Run workflow**.
3. Leave the real smoke-test option disabled for the first deployment.
4. The workflow runs local EVM tests, deploys the Factory, verifies all
   configured addresses, publishes the exact Factory source and compiler
   settings on BscScan, and uploads `bsc-testnet.json` as an artifact.

Before spending any tBNB, the workflow stops automatically if the RPC is not
chain ID 97, the wallet balance is insufficient, the Pancake V2 contracts do
not match the approved Testnet addresses, or the BscScan API is unavailable.

## 4. Review deployment

Verify the artifact contains:

- `chainId`: `97`
- expected fee recipient
- official Testnet Pancake V2 Router, Factory, and WBNB
- Factory deployment transaction hash
- Factory address
- deployment block

Open the Factory and transaction on BscScan Testnet before updating the web
application. The Factory contract page must show a verified source-code badge.

## 5. Run the real graduation smoke test

After the read-only verification succeeds:

1. Fund the deployer with at least 1.05 tBNB.
2. Run the same workflow with the smoke-test option enabled.
3. Confirm the output reports:
   - 800 million tokens in the deployer wallet
   - 200 million tokens in the Pair
   - exactly 1 WBNB curve principal in the Pair
   - non-zero LP at the burn address
4. Confirm the smoke Token and BondingCurve pages both show verified source
   code on BscScan Testnet.

The smoke test creates a real Testnet token and consumes approximately
1.006 tBNB plus gas. It must not be enabled casually on repeated runs.

## 6. Configure Vercel

Only after the deployment and smoke test pass, configure:

- `NEXT_PUBLIC_BNBX_FACTORY_ADDRESS`
- `NEXT_PUBLIC_BNBX_DEPLOYMENT_BLOCK`
- `NEXT_PUBLIC_IPFS_GATEWAY`
- server-only `PINATA_JWT`

Redeploy the Vercel project, then verify `/`, `/create`, and the smoke token
detail page.

## Mainnet

This workflow is Testnet-only and rejects any RPC whose chain ID is not `97`.
Mainnet deployment requires a separate reviewed workflow, independent audit,
multisig operations plan, and explicit release approval.
