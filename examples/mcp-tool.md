# Expose x402-disputes as an MCP tool

Give Claude (Desktop, Code, or any MCP client) direct access to this service.
The agent pays per call over x402 — on the Base rail with an EVM key, or on the
Solana rail with a Solana keypair.

## 1. A minimal MCP server

```ts
// mcp-x402-disputes.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";

const BASE = process.env.DISPUTES_URL ?? "http://localhost:4025";
const payFetch = wrapFetchWithPayment(
  fetch,
  privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`),
);

const server = new McpServer({ name: "x402-disputes", version: "0.1.0" });

server.tool(
  "open_dispute",
  "File a dispute against a settled payment ($0.01). Evidence is hashed, not stored. Returns the signed case record.",
  {
    claimant: z.string().describe("Your wallet: EVM address or Solana pubkey"),
    merchantId: z.string(),
    network: z.string().describe("e.g. base-sepolia or solana-devnet"),
    transaction: z.string().describe("The disputed payment's tx hash / signature"),
    amount: z.string().optional(),
    claimType: z.enum(["not_delivered", "partial", "wrong_item", "late", "overcharged"]),
    statement: z.string().optional(),
    evidence: z
      .array(z.object({ label: z.string(), content: z.string() }))
      .optional()
      .describe("Hashed on arrival; content is never persisted"),
  },
  async ({ claimant, merchantId, network, transaction, amount, claimType, statement, evidence }) => {
    const res = await payFetch(`${BASE}/cases`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        claimant,
        respondent: { merchantId },
        disputedPayment: { network, transaction, amount },
        claimType,
        statement,
        evidence,
      }),
    });
    return { content: [{ type: "text", text: JSON.stringify(await res.json(), null, 2) }] };
  },
);

server.tool(
  "check_dispute",
  "Buy a fresh signed status snapshot for a case ($0.001). Includes the timeline and the ruling once one exists.",
  { caseId: z.string() },
  async ({ caseId }) => {
    const res = await payFetch(`${BASE}/cases/${caseId}`);
    return { content: [{ type: "text", text: JSON.stringify(await res.json(), null, 2) }] };
  },
);

await server.connect(new StdioServerTransport());
```

```bash
npm i @modelcontextprotocol/sdk zod viem x402-fetch
```

## 2. Register it with Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "x402-disputes": {
      "command": "npx",
      "args": ["-y", "tsx", "/absolute/path/to/mcp-x402-disputes.ts"],
      "env": {
        "PRIVATE_KEY": "0xYourFundedBaseSepoliaKey",
        "DISPUTES_URL": "http://localhost:4025"
      }
    }
  }
}
```

For Claude Code: `claude mcp add x402-disputes -- npx -y tsx /absolute/path/to/mcp-x402-disputes.ts`

## 3. Paying on Solana instead

`wrapFetchWithPayment` covers the EVM rail. For the Solana rail, swap it for an
x402 Solana client (or the browser modal's
[`/server` helpers](https://www.npmjs.com/package/@three-ws/x402-payment-modal))
and select the `solana-devnet` / `solana` entry from the 402 `accepts` array.
That entry's `extra.feePayer` comes from the Solana facilitator
(`SOLANA_FACILITATOR_URL`, PayAI by default), which is a different service from
the EVM one. The tool definitions above do not change — only the fetch wrapper does.

## 4. Spending guardrails

Give the MCP server its own funded key with a small balance. Every route here is
sub-cent to a few cents, and the price is quoted in the 402 before anything is
signed, so an agent can refuse a call whose price exceeds its budget.

Full endpoint reference: [skill.md](https://github.com/nirholas/x402-disputes/blob/main/skill.md).
