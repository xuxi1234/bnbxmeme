# Token metadata

BNBX token identity is split between immutable ERC-20 fields and an immutable
metadata content address.

## On-chain fields

- `name` and `symbol` are stored by the token contract.
- `tokenMetadataURI[token]` is stored by `BNBXFactory` at creation time.
- The factory exposes no function that can replace a token's metadata URI.
- The URI is limited to 256 bytes and should normally be an `ipfs://` CID.

## IPFS JSON

The web app uploads optional token metadata to public IPFS before the user
confirms the creation transaction:

```json
{
  "name": "BNBX Cat",
  "symbol": "BCAT",
  "description": "Community description",
  "image": "ipfs://...",
  "website": "https://...",
  "telegram": "https://t.me/...",
  "twitter": "https://x.com/...",
  "debox": "https://debox.pro/...",
  "createdBy": "BNBX",
  "chainId": 97
}
```

The upload endpoint requires the server-only `PINATA_JWT` environment variable.
The JWT must never use a `NEXT_PUBLIC_` prefix.

## Validation

- Images: JPG, PNG, WebP, or GIF; maximum 2 MB.
- Description: maximum 500 characters.
- External links: HTTPS only.
- Loaded JSON is length-limited and sanitized before rendering.
- External links open with `rel="noreferrer"`.

## Production hardening

Before public mainnet launch, protect `/api/metadata` with rate limiting and
bot protection, use a narrowly scoped Pinata key, and monitor pinning quota.
