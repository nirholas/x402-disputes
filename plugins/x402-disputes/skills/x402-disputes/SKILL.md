---
name: x402-disputes
description: Call the x402-disputes HTTP service to open a dispute against a settled payment with hashed evidence, poll signed case status, and read signed rulings. Use when an agent paid for a real-world task that failed and needs a provable claim.
---

# x402-disputes

x402-disputes is an Express service for tasks that were paid for and went wrong. A claimant opens a case against a settled payment (transaction on either rail). Evidence is hashed with SHA-256 on arrival and the content is discarded; only the hashes and a combined root are kept. An arbiter rules with a key, and the signed ruling carries a refund instruction.

## Run it

No package is published and there is no hosted instance, so run it from a clone: `git clone https://github.com/nirholas/x402-disputes && cd x402-disputes`, then `npm install`, `cp .env.example .env`, and `npm run dev` (tsx `src/server.ts`). It listens on `PORT`, default 4025. For production use `npm run build` then `npm start`.

Key env vars: `PORT`, `ARBITER_KEY` (default is the public dev value `dev-arbiter-key`, so set your own before ruling on anything real), `SIGNING_SECRET`, `DATA_DIR`, `RESPONSE_WINDOW_HOURS`, `PAY_TO_ADDRESS`, `SOLANA_PAY_TO_ADDRESS`, `NETWORK`, `SOLANA_NETWORK`.

## Endpoints

- `POST /cases` ($0.01 filing fee). Body: `claimant` (EVM address or Solana pubkey), `respondent` (`merchantId` of 2 to 64 chars `[a-z0-9._:-]`, `wallet`), `disputedPayment` (`network`, `transaction`, `amount`), `claimType` (`not_delivered`, `partial`, `wrong_item`, `late`, `overcharged`), `statement` (up to 2000 chars), `requestedRemedy` (`full_refund`, `partial_refund`, `redo`, `none`), `evidence[]`. Each evidence item has a `label` and either `content` (hashed, then dropped) or a precomputed `sha256` with `bytes`. Use `sha256` to avoid sending the document at all. Returns 201 with `caseId` and the signed case record.
- `GET /cases/:id` ($0.001 per poll). A fresh signed status snapshot each time.
- `POST /rule/:id` (free, arbiter only). Header `X-Arbiter-Key: <ARBITER_KEY>`, body `{finding, remedy, refundAmount?, arbiter, rationale}`. `finding: "dismissed"` forces `remedy: "none"`. Returns the signed ruling with `refundInstruction`. 401 `ARBITER_AUTH_REQUIRED`, 409 `ALREADY_RULED`.
- `POST /evidence/hash` (free): hash a document before filing.
- `GET /cases` (free): case index. `GET /rulings/:caseId` (free): the ruling, 404 `RULING_NOT_FOUND` until one exists.
- `POST /verify` (free): body `{payload, signature}` returns `{valid}`.
- `GET /health` (free).

Other errors: 400 `INVALID_WALLET`, `INVALID_MERCHANT_ID`, `MISSING_PAYMENT_TX`, `BAD_REQUEST`; 404 `CASE_NOT_FOUND`.

Workflow: hash or attach evidence, open the case with `POST /cases`, keep the returned `caseId`, poll `GET /cases/:id` only when the user asks (each poll costs money), and read `GET /rulings/:caseId` for free. The service does not move refund money; the ruling is an instruction for the payee to act on.

## Paying

Every paid route answers an unpaid request with HTTP 402 and a body whose `accepts` array lists two rails: USDC on Base (`base-sepolia` by default, `base` via `NETWORK`) and USDC on Solana (`solana` by default, `solana-devnet` via `SOLANA_NETWORK`). Pick the entry your wallet can sign, sign the USDC payment (EIP-3009 on Base, SPL `transferChecked` on Solana), and retry with the base64 `X-PAYMENT` header. The artifact is in the 200 body and the settlement receipt is in the `X-PAYMENT-RESPONSE` header. On the EVM rail `x402-fetch` with `viem` does this for you; `npm run client` runs `examples/agent-client.ts`, which reads `BASE_URL` and `PRIVATE_KEY`.

Discovery: `GET /.well-known/x402` lists routes, prices and rails, and `GET /skill.md` serves the repo's own reference. Paying moves real USDC on the configured network, so show the user the route, amount and rail first and wait for a yes before any paid call. Use a throwaway wallet on `base-sepolia` or `solana-devnet` for testing.
