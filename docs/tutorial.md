# Tutorial — x402-disputes

A complete walkthrough: install, run the server, trigger a real 402, pay it on
either rail, and read the artifact you bought.

## 1. Install

```bash
git clone https://github.com/nirholas/x402-disputes
cd x402-disputes
npm install
```

Node 18 or newer.

## 2. Configure

```bash
cp .env.example .env
```

Everything already has a working default, so you can skip straight to step 3.
The variables that matter:

| Variable | Default | What it does |
|---|---|---|
| `PAY_TO_ADDRESS` | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` | EVM address paid on the Base rail |
| `SOLANA_PAY_TO_ADDRESS` | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` | Solana pubkey paid on the Solana rail |
| `NETWORK` | `base-sepolia` | `base` for EVM mainnet |
| `SOLANA_NETWORK` | `devnet` | `mainnet-beta` for Solana mainnet |
| `FACILITATOR_URL` | `https://x402.org/facilitator` | Verifies + settles the **EVM** rail |
| `SOLANA_FACILITATOR_URL` | `https://facilitator.payai.network` | Verifies + settles the **Solana** rail |
| `SIGNING_SECRET` | `dev-secret-change-me` | HMAC key for signed artifacts — change it |
| `PORT` | `4025` | HTTP port |

> The two `payTo` values above are the suite's own public receive addresses.
> **Set your own** if you want to be paid.

## 3. Run the server

```bash
npm run dev
```

The banner prints both rails:

```
x402-disputes listening on http://localhost:4025
  Pay in USDC on Base or Solana — your client picks the rail.
  rail 1  EVM     network=base-sepolia  payTo=0x40252CFDF8B20Ed757D61ff157719F33Ec332402
                  facilitator=https://x402.org/facilitator
  rail 2  Solana  network=solana-devnet  payTo=WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW
                  facilitator=https://facilitator.payai.network
```

## 4. Your first 402

A dispute must name the payment it is about, and evidence is hashed on arrival —
you send content, the server keeps only its SHA-256. Call the paid filing route
with no payment:

```bash
curl -s -i -X POST http://localhost:4025/cases \
  -H 'content-type: application/json' \
  -d '{"claimant":"WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
       "respondent":{"merchantId":"osteria-fiorentina.example"},
       "disputedPayment":{"network":"solana-devnet","transaction":"5Kq7xJ2mNsignature","amount":"$0.75"},
       "claimType":"not_delivered",
       "evidence":[{"label":"booking-confirmation","content":"REF-9A3C71 19:30 party of 2"}]}'
```

You get `HTTP/1.1 402 Payment Required` and a body whose `accepts` array holds
**two** entries — one per rail. `maxAmountRequired` is in USDC base units
(6 decimals), so `1000` = $0.001.

## 5. Pay it

### EVM rail (`x402-fetch`)

```bash
PRIVATE_KEY=0xYourFundedBaseSepoliaKey npm run client
```

`x402-fetch` reads the 402, picks the `base-sepolia` entry, signs an EIP-3009
`transferWithAuthorization` for exactly `maxAmountRequired`, and retries with
the `X-PAYMENT` header. Get testnet USDC from the
[Circle faucet](https://faucet.circle.com/).

### Solana rail

Point any x402 Solana client at the same URL — it picks the `solana-devnet`
entry instead. Browser wallets (Phantom) go through the drop-in
[`@three-ws/x402-payment-modal`](https://www.npmjs.com/package/@three-ws/x402-payment-modal),
which reads the same 402 and handles the prepare/sign/encode round trip.

Note that the two rails use **different facilitators**. `https://x402.org/facilitator`
settles Base; Solana settlement goes to `SOLANA_FACILITATOR_URL`
(`https://facilitator.payai.network` by default). The server picks the right one
from the rail the payment arrived on. To check whether a facilitator handles a
network, ask it:

```bash
curl -s https://facilitator.payai.network/supported | jq '.kinds[] | select(.network | startswith("solana"))'
```

## 6. Read the artifact

The `200` body **is** the thing you bought — signed case record + evidence hash.
No callbacks, no polling for a later delivery.

The response also carries `X-PAYMENT-RESPONSE`, a base64 JSON receipt:

```json
{ "success": true, "rail": "evm", "network": "base-sepolia", "transaction": "0x…", "payer": "0x…" }
```

Every artifact is signed with HMAC-SHA256 over its canonical JSON. Check one:

```bash
curl -s -X POST http://localhost:4025/verify \
  -H 'content-type: application/json' -d @artifact.json
# {"valid":true}
```

## 7. Going to mainnet

```bash
NETWORK=base \
SOLANA_NETWORK=mainnet-beta \
PAY_TO_ADDRESS=0xYourRealAddress \
SOLANA_PAY_TO_ADDRESS=YourRealSolanaPubkey \
FACILITATOR_URL=https://your-mainnet-evm-facilitator \
SOLANA_FACILITATOR_URL=https://facilitator.payai.network \
SIGNING_SECRET=$(openssl rand -hex 32) \
npm run build && npm start
```

Mainnet USDC is real money: use mainnet-capable facilitators on **both** rails
(Coinbase CDP's for Base, for example; PayAI already lists `solana` mainnet),
set a real `SIGNING_SECRET`, and put the service behind TLS so the `resource`
URL in the 402 challenge matches what clients actually call.

## 8. Evidence you can prove without handing it over

The service hashes each evidence item and immediately drops the content:

```
item.sha256   = SHA-256(content)
evidenceRoot  = SHA-256(concat(sorted item hashes))
```

So the case record proves *what* you filed without the server ever holding it.
Months later, re-hash the document you still have and compare:

```bash
curl -s -X POST http://localhost:4025/evidence/hash \
  -H 'content-type: application/json' \
  -d '{"caseId":"case_YOUR_ID",
       "evidence":[{"label":"booking-confirmation","content":"REF-9A3C71 19:30 party of 2"}]}' | jq
# { "items": [...], "root": "...", "filedRoot": "...", "matches": true }
```

That route is free — it is a pure function of its input.

If you would rather not send content at all, pass `sha256` directly and the
server takes your hash verbatim:

```json
{ "evidence": [{ "label": "receipt", "sha256": "9f2c…", "bytes": 412 }] }
```

## 9. Wallet identity on both rails

`claimant`, `respondent.wallet` and the ruling's `refundInstruction.payTo`
each accept **either** rail:

| Input | Parsed as |
|---|---|
| `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` | `{ rail: "evm", address: "0x40252c…2402" }` |
| `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` | `{ rail: "solana", address: "Wwwu…T3WwW" }` |

Cross-rail disputes are ordinary: a Solana claimant against an EVM merchant gets
a refund instruction payable on the network the disputed payment used.

## 10. Ruling as the arbiter

`POST /rule/:id` is free but authenticated:

```bash
curl -s -X POST http://localhost:4025/rule/case_YOUR_ID \
  -H 'content-type: application/json' \
  -H "X-Arbiter-Key: $ARBITER_KEY" \
  -d '{"finding":"upheld","remedy":"full_refund","arbiter":"arbiter-1",
       "rationale":"No response within the window; booking reference absent."}' | jq
```

`finding: "dismissed"` forces `remedy: "none"` and a
`refundInstruction.status: "not_applicable"`. `partial_refund` honours
`refundAmount`, capped at the disputed amount; omit it and half is awarded.

The ruling is signed, and the next paid status snapshot embeds it — so the
claimant's poll is what delivers the outcome.

## 11. Pay-per-poll, not pay-and-wait

`GET /cases/:id` charges $0.001 and returns a **fresh signed snapshot** every
time. That is deliberate: there is no route here that takes money and promises
something later. A long-running arbitration becomes a sequence of cheap reads,
each one an artifact you can keep and verify.


## Next

- [API reference](api.md) — every route, schema and error
- [For AI agents](agents.md) — discovery, MCP, listing
- [skill.md](https://github.com/nirholas/x402-disputes/blob/main/skill.md) — the agent-facing contract
