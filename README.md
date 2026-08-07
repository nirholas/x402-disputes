# x402-disputes

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![x402](https://img.shields.io/badge/payments-x402-0052ff.svg)](https://x402.org)
[![USDC on Base + Solana](https://img.shields.io/badge/USDC-Base%20%2B%20Solana-0052ff.svg)](https://x402.org)

**arbitration for failed real-world tasks** — Open a dispute against a payment that actually settled. Evidence is hashed, never stored — you get a signed case record with every hash and a combined root, a signed status snapshot per poll, and a signed ruling with a refund instruction naming the payee wallet on its rail.

## Why x402 for this

Chargebacks exist because card payments are reversible by a party that was never in the transaction. Stablecoin payments are not, which is a feature until something goes wrong — and then you need a record, not a reversal. Charging a cent to file makes frivolous cases cost something real while staying trivial for a genuine one, and charging a tenth of a cent per status read turns "is it resolved yet?" into a paid poll that returns a signed snapshot instead of a webhook you have to trust.

## Pay in USDC on Base **or** Solana — your client picks the rail

Every paid route answers an unpaid request with a 402 whose `accepts` array
carries both rails:

| Rail | Networks | Asset | payTo |
|---|---|---|---|
| EVM | `base-sepolia` (default) · `base` | USDC | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` |
| Solana | `solana-devnet` (default) · `solana` | USDC | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` |

Each rail settles through **its own facilitator** — they are not interchangeable:

| Rail | Facilitator | Env |
|---|---|---|
| EVM | `https://x402.org/facilitator` | `FACILITATOR_URL` |
| Solana | `https://facilitator.payai.network` | `SOLANA_FACILITATOR_URL` |

The x402.org reference facilitator settles Base but not Solana, so the Solana
rail defaults to PayAI's. On Solana, `extra.feePayer` is that facilitator's
sponsor account — discovered from its `/supported` endpoint at boot — so a payer
needs only USDC, never SOL for gas.

## Quickstart

```bash
git clone https://github.com/nirholas/x402-disputes && cd x402-disputes
npm install
cp .env.example .env       # optional — every value has a working default
npm run dev

# in another terminal, the full paid flow on the EVM rail:
PRIVATE_KEY=0xYourFundedBaseSepoliaKey npm run client
```


## API

| Route | Price | What you get back |
|---|---|---|
| `POST /cases` | $0.01 | Signed case record + evidence hash |
| `GET /cases/:id` | $0.001 (per poll) | Status snapshot |
| `POST /rule/:id` | free | Signed ruling + refund instruction |
| `POST /evidence/hash` | free | Item hashes, combined root, and a `matches` flag against a filed case |
| `GET /cases` | free | Case index |
| `GET /rulings/:caseId` | free | Signed ruling |
| `POST /verify` | free | `{ valid: true | false }` |
| `GET /health` | free | `{ ok: true }` |
| `GET /.well-known/x402` | free | Machine-readable discovery manifest |

`POST /rule/:id` is free but requires the `X-Arbiter-Key` header (`ARBITER_KEY` env, default `dev-arbiter-key` — change it). The value in a ruling is the signed artifact, not the request, so charging the arbiter to publish it would be backwards.

Unknown case ids return a **free** `404` — the paywall declines to charge for a snapshot that cannot exist.

## How x402 works here

1. Call a paid route with no payment → **402** with `accepts[]` quoting the exact price on **both** rails.
2. Your client picks a rail and signs: EIP-3009 `transferWithAuthorization` (EVM) or a serialized SPL transfer (Solana).
3. Retry with the `X-PAYMENT` header. The facilitator **for that rail** verifies and settles.
4. The server returns **the artifact in the 200 body**, plus `X-PAYMENT-RESPONSE` carrying `{ rail, network, transaction, payer }`.

Mainnet: `NETWORK=base`, `SOLANA_NETWORK=mainnet-beta`, and mainnet-capable
`FACILITATOR_URL` / `SOLANA_FACILITATOR_URL`.

## Real backend / API keys

Fully self-contained — **no external APIs and no API keys**. State is file-based (`data/cases.json`, `data/rulings.json`). Evidence **content** is hashed on arrival and discarded — only `sha256`, `bytes` and your label are persisted.
Artifacts are signed with HMAC-SHA256 using `SIGNING_SECRET`; the dev default
(`dev-secret-change-me`) is public, so set your own in production.

## For AI agents

- **skill.md**: [skill.md](skill.md) — agent-facing endpoints, prices, schemas, error codes.
- **Discovery manifest**: [`/.well-known/x402`](public/.well-known/x402), served live by the app, listing **both networks per resource** — indexable by [x402scan.com](https://x402scan.com), the x402 Bazaar, and [agentic.market](https://agentic.market). List your deployment there so paying agents can find it.
- **MCP**: [examples/mcp-tool.md](examples/mcp-tool.md) — wrap these routes as MCP tools for Claude.
- **Raw flow**: [examples/curl.md](examples/curl.md) — the 402 → pay → 200 walkthrough by hand.

## Docs

Full docs on GitHub Pages: **https://nirholas.github.io/x402-disputes/** — [tutorial](docs/tutorial.md) · [API reference](docs/api.md) · [for agents](docs/agents.md)

Part of the [x402 Suite](https://github.com/nirholas/x402-suite).

## Support

nichxbt@gmail.com

## License

[Apache-2.0](LICENSE)
