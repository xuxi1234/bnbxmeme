# BNBX Mainnet Acceptance Review

This repository records the review notes for the BNBX mainnet acceptance gate at:

<https://bnbx-zero-tax.eric1000005145.chatgpt.site/mainnet-acceptance?mode=01>

## Observed page state

- Page title: `BNBX — Build Next Bull System`.
- Route context: `BSC MAINNET · CLOSED` with an internal mainnet gate.
- Wallet prompt: `连接验收钱包`.
- Acceptance wallet shown on page: `0x084A9411336Bcaf635595717006Fc0DED9F491CE`.
- Public launch functions appear intentionally disabled: public creation and trading remain closed.
- Step 01 is a controlled token creation flow for a `1 BNB` graduation test token with a frontend initial-purchase cap of `0.01 BNB`.
- Step 02 is a small real buy/sell flow with a buy cap of `0.01 BNB`.
- Live state currently reports no created token, no launch, zero wallet token balance, and `0 BNB` curve principal reserve.
- The page states it will not automatically fill or graduate the curve; graduation, Pancake V2 pair creation, LP burn, and excess-refund testing are separate follow-up checks.

## Review notes

The page appears to be a closed internal mainnet acceptance console rather than a public trading page. Before running live transactions, verify that the connected wallet is the intended deployment or acceptance wallet, then perform only the small capped create/buy/sell checks described by the UI.
