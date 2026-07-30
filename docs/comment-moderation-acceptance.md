# Comment moderation production acceptance

Use this checklist after the three comment-moderation migrations are applied
and the matching Web commit is deployed. The signature is an offchain BSC
wallet message; it does not send a transaction or spend gas.

## Preconditions

- Use a wallet returned by `feeRecipient()` from an official BNBX Factory, or
  a wallet already present in the server-only
  `BNBX_COMMENT_ADMIN_WALLETS` allowlist.
- Keep a second, non-admin test wallet and one disposable test comment
  available for reversible moderation checks.
- Do not change Factory contracts, production environment variables, or
  comment settings merely to make this checklist pass.

## Authentication boundary

1. Open `/admin/moderation` in a clean browser session.
2. Confirm unauthenticated requests to `/api/admin/comments` and
   `/api/admin/comments?export=audit` return `401`.
3. Connect the authorized wallet and inspect the message before signing. It
   must contain `BNBX Comment Moderation`, the checksum wallet, `Chain ID: 56`,
   and the current ISO issue time.
4. Sign the message. Confirm the dashboard loads and the response sets an
   HttpOnly, Secure, SameSite=Strict session cookie.
5. Repeat with the non-admin wallet and confirm it remains unauthorized.

## Reversible operations

1. Report the disposable comment from the non-admin test wallet and confirm
   its report count and reason appear in the dashboard.
2. Hide and restore the disposable comment.
3. Ban the non-admin test wallet, confirm both comment submission and
   reporting return `403` with `WALLET_BANNED`, then unban it.
4. Download the audit CSV and confirm the hide, restore, ban, and unban rows
   contain the acting admin wallet and correct timestamps.
5. Log out and confirm both admin endpoints return `401` again.

Record the deployment ID, admin wallet, test comment ID, response statuses,
and audit row IDs. Never record signatures, cookies, private keys, service
credentials, or complete environment values.
