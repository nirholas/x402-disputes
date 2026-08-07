# API reference — x402-disputes

Base URL: `http://localhost:4025` in development.

All paid routes speak **x402** and offer **two rails** — USDC on Base (EVM) and
USDC on Solana. The 402 challenge lists both; your client picks one. The
purchased artifact is always in the `200` body.

| Route | Price | Returns |
|---|---|---|
| `POST /cases` | $0.01 | Signed case record + evidence hash |
| `GET /cases/:id` | $0.001 (per poll) | Status snapshot |
| `POST /rule/:id` | free | Signed ruling + refund instruction |
| `POST /evidence/hash` | free | Item hashes, combined root, and a `matches` flag against a filed case |
| `GET /cases` | free | Case index |
| `GET /rulings/:caseId` | free | Signed ruling |
| `POST /verify` | free | `{ valid: true | false }` |
| `GET /health` | free | `{ ok: true }` |

Every artifact is signed: `signature` is an HMAC-SHA256 (hex) over the
canonical JSON of the artifact minus `signature`/`algorithm`, keyed by
`SIGNING_SECRET`. `POST /verify` re-checks it for free.

---

## POST /cases

**Price**: $0.01 — USDC on Base or Solana  
**Returns**: Signed case record + evidence hash

Open a dispute against a settled payment. Evidence is hashed on arrival and the content discarded; the signed case record carries every hash plus a combined root.

### Body parameters

| Name | Type | Default | Description |
|---|---|---|---|
| `claimant` | string | — | **Required.** Your wallet: EVM address or Solana pubkey |
| `respondent.merchantId` | string | — | **Required.** 2-64 chars of `[a-z0-9._:-]` |
| `respondent.wallet` | string | `null` | The merchant's wallet, if known — either rail |
| `disputedPayment.transaction` | string | — | **Required.** Settlement tx hash / signature, ≤128 chars |
| `disputedPayment.network` | string | `base-sepolia` | Network the payment settled on; the rail is inferred |
| `disputedPayment.amount` | string | `$0.00` | What was paid — caps any refund award |
| `claimType` | `not_delivered`\|`partial`\|`wrong_item`\|`late`\|`overcharged` | `not_delivered` | What went wrong |
| `statement` | string | `""` | Your account, ≤2000 chars |
| `requestedRemedy` | `full_refund`\|`partial_refund`\|`redo`\|`none` | `full_refund` | What you are asking for |
| `evidence` | array | `[]` | Up to 12 items of `{ label, content }` or `{ label, sha256, bytes }` |

### Example request

```bash
# unpaid → 402 with both rails
curl -s -i -X POST http://localhost:4025/cases -H 'content-type: application/json' \
  -d '{"claimant":"WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
       "respondent":{"merchantId":"osteria-fiorentina.example"},
       "disputedPayment":{"network":"solana-devnet","transaction":"5Kq7xJ2mNsignature","amount":"$0.75"},
       "claimType":"not_delivered"}'

# paid (EVM rail)
PRIVATE_KEY=0x... npm run client
```

### Example response (`201`)

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

### Unpaid (`402`)

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "10000",
      "resource": "http://localhost:4025/cases",
      "description": "Open a dispute against a settled payment. Evidence is hashed on arrival and the content discarded; the signed case record carries every hash plus a combined root.",
      "mimeType": "application/json",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "maxTimeoutSeconds": 120,
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    },
    {
      "scheme": "exact",
      "network": "solana-devnet",
      "maxAmountRequired": "10000",
      "resource": "http://localhost:4025/cases",
      "description": "Open a dispute against a settled payment. Evidence is hashed on arrival and the content discarded; the signed case record carries every hash plus a combined root.",
      "mimeType": "application/json",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "maxTimeoutSeconds": 120,
      "asset": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      "extra": {
        "feePayer": "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4"
      }
    }
  ]
}
```

### Errors

| Status | Code | Meaning |
|---|---|---|
| 400 | `INVALID_WALLET` | claimant is not an EVM address or Solana pubkey |
| 400 | `INVALID_MERCHANT_ID` | Malformed respondent.merchantId |
| 400 | `MISSING_PAYMENT_TX` | disputedPayment.transaction is required |

---

## GET /cases/:id

**Price**: $0.001 (per poll) — USDC on Base or Solana  
**Returns**: Status snapshot

Buy a fresh signed status snapshot: current status, response deadline, whether it is overdue, the timeline, and the ruling once one exists.

### Path parameters

| Name | Description |
|---|---|
| `id` | The caseId from `POST /cases` |

### Example request

```bash
# unpaid → 402 with both rails
curl -s -i http://localhost:4025/cases/case_YOUR_ID

# paid (EVM rail)
PRIVATE_KEY=0x... npm run client
```

### Example response (`200`)

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

### Unpaid (`402`)

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "1000",
      "resource": "http://localhost:4025/cases/:id",
      "description": "Buy a fresh signed status snapshot: current status, response deadline, whether it is overdue, the timeline, and the ruling once one exists.",
      "mimeType": "application/json",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "maxTimeoutSeconds": 120,
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    },
    {
      "scheme": "exact",
      "network": "solana-devnet",
      "maxAmountRequired": "1000",
      "resource": "http://localhost:4025/cases/:id",
      "description": "Buy a fresh signed status snapshot: current status, response deadline, whether it is overdue, the timeline, and the ruling once one exists.",
      "mimeType": "application/json",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "maxTimeoutSeconds": 120,
      "asset": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      "extra": {
        "feePayer": "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4"
      }
    }
  ]
}
```

### Errors

| Status | Code | Meaning |
|---|---|---|
| 404 | `CASE_NOT_FOUND` | Unknown caseId. The 402 challenge is returned before the case is resolved — so the route is always quotable, and payment settles first. Take ids from the free `GET /cases` index |

---

## POST /rule/:id

**Price**: free  
**Returns**: Signed ruling + refund instruction

Rule on a case. Free, but requires the arbiter key in the X-Arbiter-Key header. Returns the signed ruling and its refund instruction.

### Path parameters

| Name | Description |
|---|---|
| `id` | The caseId |

### Body parameters

| Name | Type | Default | Description |
|---|---|---|---|
| `finding` | `upheld`\|`partially_upheld`\|`dismissed` | `dismissed` | The arbiter's conclusion |
| `remedy` | `full_refund`\|`partial_refund`\|`redo`\|`none` | the requested remedy | What the merchant must do; forced to `none` on a dismissal |
| `refundAmount` | string | half the disputed amount | Only used for `partial_refund`; capped at the disputed amount |
| `rationale` | string | `""` | Reasoning, ≤2000 chars — part of the signed ruling |
| `arbiter` | string | `arbiter` | Who ruled, ≤80 chars |

### Example request

```bash
curl -s -X POST http://localhost:4025/rule/case_YOUR_ID \
  -H 'content-type: application/json' \
  -H "X-Arbiter-Key: $ARBITER_KEY" \
  -d '{"finding":"upheld","remedy":"full_refund","arbiter":"arbiter-1",
       "rationale":"No response within the window."}'
```

### Example response (`201`)

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

### Errors

| Status | Code | Meaning |
|---|---|---|
| 401 | `ARBITER_AUTH_REQUIRED` | X-Arbiter-Key missing or wrong |
| 404 | `CASE_NOT_FOUND` | Unknown caseId |
| 409 | `ALREADY_RULED` | Case has already been ruled on |

---

## POST /evidence/hash

**Price**: free  
**Returns**: Item hashes, combined root, and a `matches` flag against a filed case

Recompute evidence hashes locally and, with a caseId, compare against the root that was filed. Free — a pure function of its input.

### Example request

```bash
curl -s -X POST http://localhost:4025/evidence/hash -H 'content-type: application/json' \
  -d '{"caseId":"case_YOUR_ID","evidence":[{"label":"booking-confirmation","content":"REF-9A3C71 19:30 party of 2"}]}'
```

### Example response (`200`)

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

---

## GET /cases

**Price**: free  
**Returns**: Case index

Case index — ids, status, claim type and merchant only. No statements, no evidence hashes.

### Example request

```bash
curl -s http://localhost:4025/cases
```

### Example response (`200`)

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

---

## GET /rulings/:caseId

**Price**: free  
**Returns**: Signed ruling

The signed ruling for a case, once one exists.

### Path parameters

| Name | Description |
|---|---|
| `caseId` | The caseId |

### Example request

```bash
curl -s http://localhost:4025/rulings/case_YOUR_ID
```

### Example response (`200`)

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

### Errors

| Status | Code | Meaning |
|---|---|---|
| 404 | `RULING_NOT_FOUND` | No ruling for that case yet |

---

## POST /verify

**Price**: free  
**Returns**: `{ valid: true | false }`

Verify the HMAC-SHA256 signature of any case record, status snapshot or ruling.

### Example request

```bash
curl -s -X POST http://localhost:4025/verify -H 'content-type: application/json' -d @ruling.json
```

### Example response (`200`)

```json
{
  "valid": true
}
```

---

## GET /health

**Price**: free  
**Returns**: `{ ok: true }`

Liveness probe.

### Example request

```bash
curl -s http://localhost:4025/health
```

### Example response (`200`)

```json
{
  "ok": true,
  "service": "x402-disputes"
}
```


---

## Payment headers

| Header | Direction | Meaning |
|---|---|---|
| `X-PAYMENT` | request | Base64 x402 payload. EVM: signed EIP-3009 authorization. Solana: signed serialized transaction. |
| `X-PAYMENT-RESPONSE` | response | Base64 `{ success, rail, network, transaction, payer }` settlement receipt. |

Paid responses also echo that receipt in the body under `settlement`, purely for
convenience. It is attached **after** the artifact is signed and is excluded from
signature verification, so you can post a whole paid response body straight to
`POST /verify` and still get `{ "valid": true }`.

## Global error shape

```json
{ "error": "CODE", "message": "human readable explanation" }
```
