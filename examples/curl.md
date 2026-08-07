# Raw 402 → pay → 200 walkthrough (curl)

Start the server:

```bash
npm run dev
```

## 1. File a case — $0.01 → dual-rail 402

Evidence `content` is hashed on arrival and then dropped; only the SHA-256 and
the byte count are kept.

```bash
curl -s -i -X POST http://localhost:4025/cases \
  -H 'content-type: application/json' \
  -d '{"claimant":"WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
       "respondent":{"merchantId":"osteria-fiorentina.example",
                     "wallet":"0x40252CFDF8B20Ed757D61ff157719F33Ec332402"},
       "disputedPayment":{"network":"solana-devnet","transaction":"5Kq7xJ2mNsignature","amount":"$0.75"},
       "claimType":"not_delivered",
       "statement":"Arrived on time, no reservation on file.",
       "evidence":[{"label":"booking-confirmation","content":"REF-9A3C71 19:30 party of 2"}]}'
```

`HTTP/1.1 402 Payment Required`, with **two** entries in `accepts`:

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    { "scheme": "exact", "network": "base-sepolia", "maxAmountRequired": "10000",
      "resource": "http://localhost:4025/cases",
      "description": "Open a dispute case with hashed evidence",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extra": { "name": "USDC", "version": "2" } },
    { "scheme": "exact", "network": "solana-devnet", "maxAmountRequired": "10000",
      "resource": "http://localhost:4025/cases",
      "description": "Open a dispute case with hashed evidence",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "asset": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      "extra": { "feePayer": "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4" } }
  ]
}
```

`maxAmountRequired` is in USDC base units (6 decimals): `10000` = $0.01.

## 2. Pay and retry

```bash
PRIVATE_KEY=0x... npm run client
```

The `201` body is the signed case record — including every evidence hash and
the combined `evidenceRoot`. Keep it: that is your proof of what you filed.

## 3. Poll the status — $0.001 each read

```bash
curl -s -i http://localhost:4025/cases/case_YOUR_ID    # 402, both rails, $0.001
```

Each paid read returns a **fresh signed snapshot** with its own `snapshotAt`,
a timeline, an `overdue` flag, and the ruling embedded once one exists. There is
no pay-now-deliver-later route here.

## 4. Rule on it (free, arbiter-authenticated)

```bash
curl -s -X POST http://localhost:4025/rule/case_YOUR_ID \
  -H 'content-type: application/json' \
  -H 'X-Arbiter-Key: dev-arbiter-key' \
  -d '{"finding":"upheld","remedy":"full_refund","arbiter":"arbiter-1",
       "rationale":"No response within the window."}' | jq '.refundInstruction'
```

```json
{
  "payTo": { "rail": "solana", "address": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW" },
  "amount": "$0.75",
  "asset": "USDC",
  "network": "solana-devnet",
  "reference": "refund for case case_… / payment 5Kq7xJ2mNsignature",
  "status": "instructed"
}
```

## 5. Free checks

```bash
# unknown case → free 404, no charge
curl -s -i http://localhost:4025/cases/case_nope

# prove a document you still hold is the one you filed
curl -s -X POST http://localhost:4025/evidence/hash -H 'content-type: application/json' \
  -d '{"caseId":"case_YOUR_ID","evidence":[{"label":"booking-confirmation","content":"REF-9A3C71 19:30 party of 2"}]}' | jq '.matches'

# index, ruling lookup, signature checks
curl -s http://localhost:4025/cases | jq
curl -s http://localhost:4025/rulings/case_YOUR_ID | jq
curl -s -X POST http://localhost:4025/verify -H 'content-type: application/json' -d @ruling.json | jq
```
