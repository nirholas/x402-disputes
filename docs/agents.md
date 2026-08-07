# For AI agents — x402-disputes

## What an agent gets

Arbitration for tasks that were paid for and then went wrong. A claimant opens a case against a payment that provably settled — naming the transaction on either rail — and attaches evidence. **The evidence itself is never stored**: each item is hashed with SHA-256 and only the hashes plus a combined root are kept, so receipts and chat logs stay on the claimant's side while remaining provable later. Opening a case ($0.01) returns the signed case record with every hash. Reading a case ($0.001) returns a fresh signed status snapshot — pay-per-poll, not a promise of a later push. An arbiter rules for free (authenticated) and the signed ruling carries a refund instruction naming the payee wallet, amount and network.

Every paid route hands back the artifact **in the 200 body**. There is no
"payment accepted, check back later" path to babysit.

## 1. Discover

Two machine-readable entry points:

| Artifact | URL | Purpose |
|---|---|---|
| Skill file | [`skill.md`](https://github.com/nirholas/x402-disputes/blob/main/skill.md) | Endpoints, prices, request/response schemas, error codes — drop it into an agent's tool context |
| Manifest | `{BASE_URL}/.well-known/x402` | The x402 discovery format: resources, prices, accepted networks, output schemas |
| OpenAPI | [`openapi.json`](https://github.com/nirholas/x402-disputes/blob/main/openapi.json) | OpenAPI 3.1 including the dual-rail 402 response |

```bash
curl -s http://localhost:4025/.well-known/x402 | jq '.resources[] | {resource, price, accepts}'
```

## 2. Pay — pick a rail

An unpaid call to a paid route returns `402` with two `accepts` entries:

| Rail | Network | Asset | payTo |
|---|---|---|---|
| EVM | `base-sepolia` / `base` | USDC `0x036CbD…dCF7e` | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` |
| Solana | `solana-devnet` / `solana` | USDC `4zMMC9…ncDU` | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` |

An agent holding an EVM key uses the first entry; an agent holding a Solana
keypair uses the second. Each rail is verified and settled by **its own**
facilitator — `https://x402.org/facilitator` for Base,
`https://facilitator.payai.network` for Solana — because no single facilitator
here settles both. The server routes to the right one based on the rail the
payment arrived on; from the client's side nothing changes.

```ts
import { wrapFetchWithPayment } from "x402-fetch";
import { privateKeyToAccount } from "viem/accounts";

const payFetch = wrapFetchWithPayment(fetch, privateKeyToAccount(process.env.PRIVATE_KEY));

// paid ($0.01): file, with evidence hashed client-visibly
const record = await (await payFetch(`${BASE}/cases`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({
    claimant: myWallet,                       // EVM address or Solana pubkey
    respondent: { merchantId, wallet: theirWallet },
    disputedPayment: { network, transaction, amount: "$0.75" },
    claimType: "not_delivered",
    evidence: [{ label: "receipt", content: receiptText }],
  }),
})).json();

// paid ($0.001): poll until it resolves — every read is a signed snapshot
const snap = await (await payFetch(`${BASE}/cases/${record.caseId}`)).json();
if (snap.ruling) {
  snap.ruling.refundInstruction;   // { payTo: { rail, address }, amount, network }
}
```

On the Solana side, the `accepts` entry carries `extra.feePayer` — the Solana
facilitator's sponsor account that pays the SOL network fee, so an agent needs
only USDC, never SOL for gas. That value is read from the Solana facilitator's
`/supported` endpoint at runtime, so pointing `SOLANA_FACILITATOR_URL`
elsewhere automatically advertises that facilitator's sponsor instead.

## 3. Verify what you bought

Artifacts are HMAC-SHA256 signed over canonical JSON. Re-check any of them for
free:

```bash
curl -s -X POST http://localhost:4025/verify -H 'content-type: application/json' -d @artifact.json
# {"valid": true}
```

The `X-PAYMENT-RESPONSE` header on every paid 200 carries the settlement
receipt, so an agent can log `{ rail, network, transaction, payer }` next to the
artifact it paid for.

## 4. MCP integration

[`examples/mcp-tool.md`](https://github.com/nirholas/x402-disputes/blob/main/examples/mcp-tool.md) wraps these
routes as MCP tools for Claude Desktop / Claude Code, including the
`claude_desktop_config.json` block.

## 5. Listing

Deploy it, then list the deployment so paying agents can find it:

- **[x402scan.com](https://x402scan.com)** — submit the base URL; it reads `/.well-known/x402`.
- **x402 Bazaar** — the facilitator-hosted resource directory; the manifest is already in the right shape.
- **[agentic.market](https://agentic.market)** — agent-facing marketplace listing; point it at `skill.md`.

Keep `/.well-known/x402` reachable without payment (it is, by design) and keep
`resource` URLs in the 402 matching your public hostname.

## Contact

nichxbt@gmail.com
