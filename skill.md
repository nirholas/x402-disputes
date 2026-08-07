# x402-disputes — agent skill

Arbitration for tasks that were paid for and then went wrong. A claimant opens a case against a payment that provably settled — naming the transaction on either rail — and attaches evidence. **The evidence itself is never stored**: each item is hashed with SHA-256 and only the hashes plus a combined root are kept, so receipts and chat logs stay on the claimant's side while remaining provable later. Opening a case ($0.01) returns the signed case record with every hash. Reading a case ($0.001) returns a fresh signed status snapshot — pay-per-poll, not a promise of a later push. An arbiter rules for free (authenticated) and the signed ruling carries a refund instruction naming the payee wallet, amount and network.

**Base URL**: `{BASE_URL}` (self-hosted; e.g. `http://localhost:4025`)

## Endpoints

### POST /cases — $0.01
Open a dispute against a settled payment. Evidence is hashed on arrival and the content discarded; the signed case record carries every hash plus a combined root.

Request body:
```json
{
  "claimant": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
  "respondent": {
    "merchantId": "osteria-fiorentina.example",
    "wallet": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402"
  },
  "disputedPayment": {
    "network": "solana-devnet",
    "transaction": "5Kq7xJ2mNsignature",
    "amount": "$0.75"
  },
  "claimType": "not_delivered",
  "statement": "Arrived on time, no reservation on file, turned away.",
  "requestedRemedy": "full_refund",
  "evidence": [
    {
      "label": "booking-confirmation",
      "content": "REF-9A3C71 19:30 party of 2"
    },
    {
      "label": "receipt",
      "sha256": "9f2c4a1b8d3e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8",
      "bytes": 412
    }
  ]
}
```

`claimant` and `respondent.wallet` each accept an EVM address or a Solana pubkey. Evidence items take either `content` (hashed here, then dropped) or a precomputed `sha256` — use the latter if you would rather not transmit the document at all.

Response `201`:
```json
{
  "caseId": "case_8d1f47a2-6b30-4c95-9e21-3f0a5c7b8d12",
  "document": "x402-disputes/case",
  "claimant": {
    "rail": "solana",
    "address": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"
  },
  "respondent": {
    "merchantId": "osteria-fiorentina.example",
    "wallet": {
      "rail": "evm",
      "address": "0x40252cfdf8b20ed757d61ff157719f33ec332402"
    }
  },
  "disputedPayment": {
    "rail": "solana",
    "network": "solana-devnet",
    "transaction": "5Kq7xJ2mNsignature",
    "amount": "$0.75"
  },
  "claimType": "not_delivered",
  "statement": "Paid for a held table at 19:30. Arrived on time, no reservation on file, turned away.",
  "requestedRemedy": "full_refund",
  "evidence": [
    {
      "label": "booking-confirmation",
      "sha256": "0de7e63593a343f336173a4f67e4a8b20f001df27056fcd7d9afbae3ceabaeee",
      "bytes": 27
    },
    {
      "label": "arrival-photo-hash",
      "sha256": "1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809",
      "bytes": 64
    },
    {
      "label": "chat-log",
      "sha256": "d51e40a0508a237cd4cfa6f9787b26be91fb09bf99116b7cb96149181a91c1c5",
      "bytes": 43
    }
  ],
  "evidenceRoot": "56558a3e037fc835853ac0be7b03b8291b71a555ed85cdc9038da094dcf3de7a",
  "filingFee": "$0.01",
  "openedAt": "2026-01-12T20:15:00.000Z",
  "respondBy": "2026-01-15T20:15:00.000Z",
  "status": "awaiting_response",
  "signature": "b62d…hex hmac…",
  "algorithm": "HMAC-SHA256",
  "settlement": {
    "rail": "solana",
    "network": "solana-devnet",
    "transaction": "3Ha…signature…",
    "payer": "ClaimantPubkey…",
    "amount": "10000"
  }
}
```

### GET /cases/:id — $0.001 (per poll)
Buy a fresh signed status snapshot: current status, response deadline, whether it is overdue, the timeline, and the ruling once one exists.

Response `200`:
```json
{
  "caseId": "case_8d1f47a2-6b30-4c95-9e21-3f0a5c7b8d12",
  "document": "x402-disputes/status",
  "status": "ruled",
  "claimType": "not_delivered",
  "claimant": {
    "rail": "solana",
    "address": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"
  },
  "respondent": {
    "merchantId": "osteria-fiorentina.example",
    "wallet": {
      "rail": "evm",
      "address": "0x40252cfdf8b20ed757d61ff157719f33ec332402"
    }
  },
  "disputedPayment": {
    "rail": "solana",
    "network": "solana-devnet",
    "transaction": "5Kq7xJ2mNsignature",
    "amount": "$0.75"
  },
  "requestedRemedy": "full_refund",
  "evidenceRoot": "56558a3e037fc835853ac0be7b03b8291b71a555ed85cdc9038da094dcf3de7a",
  "evidenceCount": 3,
  "openedAt": "2026-01-12T20:15:00.000Z",
  "respondBy": "2026-01-15T20:15:00.000Z",
  "overdue": false,
  "timeline": [
    {
      "at": "2026-01-12T20:15:00.000Z",
      "event": "case_opened",
      "detail": "not_delivered against osteria-fiorentina.example for payment 5Kq7xJ2mNsignature"
    },
    {
      "at": "2026-01-13T09:00:00.000Z",
      "event": "ruled",
      "detail": "upheld → full_refund"
    },
    {
      "at": "2026-01-15T20:15:00.000Z",
      "event": "response_due",
      "detail": "72h response window"
    }
  ],
  "ruling": {
    "rulingId": "rul_2c6e9b05-71a3-4d8f-b024-9e5c7a1f3b60",
    "document": "x402-disputes/ruling",
    "caseId": "case_8d1f47a2-6b30-4c95-9e21-3f0a5c7b8d12",
    "finding": "upheld",
    "remedy": "full_refund",
    "rationale": "Merchant did not respond within the 72h window and the booking reference does not appear in their confirmation feed. Evidence root matches the filed bundle.",
    "refundInstruction": {
      "payTo": {
        "rail": "solana",
        "address": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"
      },
      "amount": "$0.75",
      "asset": "USDC",
      "network": "solana-devnet",
      "reference": "refund for case case_8d1f47a2-6b30-4c95-9e21-3f0a5c7b8d12 / payment 5Kq7xJ2mNsignature",
      "status": "instructed"
    },
    "arbiter": "arbiter-1",
    "ruledAt": "2026-01-13T09:00:00.000Z",
    "signature": "0e94…hex hmac…",
    "algorithm": "HMAC-SHA256"
  },
  "snapshotAt": "2026-01-13T09:30:00.000Z",
  "signature": "5ac7…hex hmac…",
  "algorithm": "HMAC-SHA256",
  "settlement": {
    "rail": "evm",
    "network": "base-sepolia",
    "transaction": "0xabc…",
    "payer": "0xPayer…",
    "amount": "1000"
  }
}
```

Every read returns a **new** signed snapshot with its own `snapshotAt` — this is the pay-per-poll shape, not a subscription. Unknown case ids are a **free** `404`.

### POST /rule/:id — free
Rule on a case. Free, but requires the arbiter key in the X-Arbiter-Key header. Returns the signed ruling and its refund instruction.

Request body:
```json
{
  "finding": "upheld",
  "remedy": "full_refund",
  "refundAmount": "$0.75",
  "arbiter": "arbiter-1",
  "rationale": "No response within the window; booking reference absent from the merchant's feed."
}
```

Send `X-Arbiter-Key: $ARBITER_KEY`. `finding: "dismissed"` forces `remedy: "none"`. `partial_refund` honours `refundAmount`, capped at the disputed amount (default: half).

Response `201`:
```json
{
  "rulingId": "rul_2c6e9b05-71a3-4d8f-b024-9e5c7a1f3b60",
  "document": "x402-disputes/ruling",
  "caseId": "case_8d1f47a2-6b30-4c95-9e21-3f0a5c7b8d12",
  "finding": "upheld",
  "remedy": "full_refund",
  "rationale": "Merchant did not respond within the 72h window and the booking reference does not appear in their confirmation feed. Evidence root matches the filed bundle.",
  "refundInstruction": {
    "payTo": {
      "rail": "solana",
      "address": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"
    },
    "amount": "$0.75",
    "asset": "USDC",
    "network": "solana-devnet",
    "reference": "refund for case case_8d1f47a2-6b30-4c95-9e21-3f0a5c7b8d12 / payment 5Kq7xJ2mNsignature",
    "status": "instructed"
  },
  "arbiter": "arbiter-1",
  "ruledAt": "2026-01-13T09:00:00.000Z",
  "signature": "0e94…hex hmac…",
  "algorithm": "HMAC-SHA256"
}
```

### POST /evidence/hash — free
Recompute evidence hashes locally and, with a caseId, compare against the root that was filed. Free — a pure function of its input.

Request body:
```json
{
  "caseId": "case_8d1f47a2-6b30-4c95-9e21-3f0a5c7b8d12",
  "evidence": [
    {
      "label": "booking-confirmation",
      "content": "REF-9A3C71 19:30 party of 2"
    }
  ]
}
```

Response `200`:
```json
{
  "items": [
    {
      "label": "booking-confirmation",
      "sha256": "0de7e63593a343f336173a4f67e4a8b20f001df27056fcd7d9afbae3ceabaeee",
      "bytes": 27
    }
  ],
  "root": "d13f37d8e404be5036002754234f691a6e09dbb89855864eebcb68e0a39c1259",
  "caseId": "case_8d1f47a2-6b30-4c95-9e21-3f0a5c7b8d12",
  "filedRoot": "56558a3e037fc835853ac0be7b03b8291b71a555ed85cdc9038da094dcf3de7a",
  "matches": true
}
```

### GET /cases — free
Case index — ids, status, claim type and merchant only. No statements, no evidence hashes.

Response `200`:
```json
{
  "cases": [
    {
      "caseId": "case_8d1f47a2-6b30-4c95-9e21-3f0a5c7b8d12",
      "status": "ruled",
      "claimType": "not_delivered",
      "merchantId": "osteria-fiorentina.example",
      "openedAt": "2026-01-12T20:15:00.000Z"
    }
  ]
}
```

### GET /rulings/:caseId — free
The signed ruling for a case, once one exists.

Response `200`:
```json
{
  "rulingId": "rul_2c6e9b05-71a3-4d8f-b024-9e5c7a1f3b60",
  "document": "x402-disputes/ruling",
  "caseId": "case_8d1f47a2-6b30-4c95-9e21-3f0a5c7b8d12",
  "finding": "upheld",
  "remedy": "full_refund",
  "rationale": "Merchant did not respond within the 72h window and the booking reference does not appear in their confirmation feed. Evidence root matches the filed bundle.",
  "refundInstruction": {
    "payTo": {
      "rail": "solana",
      "address": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"
    },
    "amount": "$0.75",
    "asset": "USDC",
    "network": "solana-devnet",
    "reference": "refund for case case_8d1f47a2-6b30-4c95-9e21-3f0a5c7b8d12 / payment 5Kq7xJ2mNsignature",
    "status": "instructed"
  },
  "arbiter": "arbiter-1",
  "ruledAt": "2026-01-13T09:00:00.000Z",
  "signature": "0e94…hex hmac…",
  "algorithm": "HMAC-SHA256"
}
```

### POST /verify — free
Verify the HMAC-SHA256 signature of any case record, status snapshot or ruling.

Request body:
```json
{
  "rulingId": "rul_2c6e9b05-71a3-4d8f-b024-9e5c7a1f3b60",
  "document": "x402-disputes/ruling",
  "caseId": "case_8d1f47a2-6b30-4c95-9e21-3f0a5c7b8d12",
  "finding": "upheld",
  "remedy": "full_refund",
  "rationale": "Merchant did not respond within the 72h window and the booking reference does not appear in their confirmation feed. Evidence root matches the filed bundle.",
  "refundInstruction": {
    "payTo": {
      "rail": "solana",
      "address": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"
    },
    "amount": "$0.75",
    "asset": "USDC",
    "network": "solana-devnet",
    "reference": "refund for case case_8d1f47a2-6b30-4c95-9e21-3f0a5c7b8d12 / payment 5Kq7xJ2mNsignature",
    "status": "instructed"
  },
  "arbiter": "arbiter-1",
  "ruledAt": "2026-01-13T09:00:00.000Z",
  "signature": "0e94…hex hmac…",
  "algorithm": "HMAC-SHA256"
}
```

Response `200`:
```json
{
  "valid": true
}
```

### GET /health — free
Liveness probe.

Response `200`:
```json
{
  "ok": true,
  "service": "x402-disputes"
}
```

## Payment — dual rail

**Pay in USDC on Base or Solana — your client picks the rail.**

Every paid route answers an unpaid request with `402` and an `accepts` array
holding both rails:

```json
{
  "x402Version": 1,
  "accepts": [
    { "scheme": "exact", "network": "base-sepolia", "asset": "USDC (0x036CbD53842c5426634e7929541eC2318f3dCF7e)",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402", "maxAmountRequired": "<base units, 6 decimals>" },
    { "scheme": "exact", "network": "solana-devnet", "asset": "USDC (4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU)",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW", "maxAmountRequired": "<base units, 6 decimals>",
      "extra": { "feePayer": "<facilitator sponsor>" } }
  ]
}
```

- Protocol: **x402** (HTTP 402). Asset **USDC** on both rails.
- EVM networks: `base-sepolia` (default) or `base` (`NETWORK=base`).
- Solana networks: `solana-devnet` (default) or `solana` (`SOLANA_NETWORK=mainnet-beta`).
- Facilitators — **one per rail, they are not interchangeable**:
  - EVM: `https://x402.org/facilitator` (`FACILITATOR_URL`)
  - Solana: `https://facilitator.payai.network` (`SOLANA_FACILITATOR_URL`) — the x402.org facilitator does not settle Solana.
- Pay via `x402-fetch` (EVM), a Solana x402 client, or any x402-capable client: call the route, read `402`, pick an entry from `accepts`, sign, retry with the `X-PAYMENT` header. You get the artifact in the `200` body plus an `X-PAYMENT-RESPONSE` header carrying the settlement receipt (`{ rail, network, transaction, payer }`).

## Error codes

| Status | Code | Meaning |
|---|---|---|
| 402 | — | Payment required — dual-rail x402 challenge with `accepts[]` |
| 400 | `INVALID_WALLET` | `claimant` is neither an EVM address nor a Solana pubkey |
| 400 | `INVALID_MERCHANT_ID` | `respondent.merchantId` is not 2-64 chars of `[a-z0-9._:-]` |
| 400 | `MISSING_PAYMENT_TX` | `disputedPayment.transaction` is required |
| 401 | `ARBITER_AUTH_REQUIRED` | `X-Arbiter-Key` missing or wrong on `POST /rule/:id` |
| 404 | `CASE_NOT_FOUND` | Unknown caseId (**not charged**) |
| 404 | `RULING_NOT_FOUND` | No ruling for that case yet |
| 409 | `ALREADY_RULED` | Case has already been ruled on |
| 400 | `BAD_REQUEST` | Malformed body |

## Discovery

Machine-readable manifest: `{BASE_URL}/.well-known/x402` (lists both networks per resource).

## Contact

nichxbt@gmail.com
