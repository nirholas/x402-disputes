/**
 * Full x402 flow for x402-disputes:
 *   1. file a case            ($0.01, paid)  — evidence hashed, never stored
 *   2. poll the status        ($0.001, paid) — a fresh signed snapshot per read
 *   3. rule on it             (free, arbiter-authenticated)
 *   4. poll again             ($0.001, paid) — the ruling is now embedded
 *   5. prove the evidence      (free)        — re-hash and compare the root
 *
 * The claimant here is a Solana pubkey while the payment is made on the EVM
 * rail, which is the point: wallets and rails are independent.
 *
 * Usage:
 *   PRIVATE_KEY=0x... BASE_URL=http://localhost:4025 npx tsx examples/agent-client.ts
 */
import { privateKeyToAccount } from "viem/accounts";
import { decodeXPaymentResponse, wrapFetchWithPayment } from "x402-fetch";

const BASE_URL = process.env.BASE_URL || "http://localhost:4025";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ARBITER_KEY = process.env.ARBITER_KEY || "dev-arbiter-key";
/** Claimant wallet — an EVM address or a Solana pubkey, both accepted. */
const CLAIMANT = process.env.CLAIMANT || "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW";

/** The document the claimant keeps; only its hash ever reaches the server. */
const CONFIRMATION = "REF-9A3C71 — Osteria Fiorentina, 19:30, party of 2";

function receipt(res: Response): void {
  const header = res.headers.get("x-payment-response");
  if (header) console.log("  X-PAYMENT-RESPONSE:", decodeXPaymentResponse(header));
}

async function main() {
  if (!PRIVATE_KEY) {
    console.error("Set PRIVATE_KEY to a funded base-sepolia key (USDC + a little ETH).");
    process.exit(1);
  }
  const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
  const payFetch = wrapFetchWithPayment(fetch, account);

  // 1. File — $0.01. The signed case record is the artifact.
  const fileRes = await payFetch(`${BASE_URL}/cases`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      claimant: CLAIMANT,
      respondent: {
        merchantId: "osteria-fiorentina.example",
        wallet: "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      },
      disputedPayment: {
        network: "solana-devnet",
        transaction: `sol_demo_${Date.now()}`,
        amount: "$0.75",
      },
      claimType: "not_delivered",
      statement: "Arrived on time, no reservation on file, turned away.",
      requestedRemedy: "full_refund",
      // Content is hashed here and discarded — the server never keeps it.
      evidence: [{ label: "booking-confirmation", content: CONFIRMATION }],
    }),
  });
  if (!fileRes.ok) {
    console.error("Filing failed:", fileRes.status, await fileRes.text());
    process.exit(1);
  }
  const record = await fileRes.json();
  console.log("Signed case record (the purchased artifact):\n", JSON.stringify(record, null, 2));
  receipt(fileRes);

  // 2. Poll — $0.001 per read, each one a fresh signed snapshot.
  const firstRes = await payFetch(`${BASE_URL}/cases/${record.caseId}`);
  const first = await firstRes.json();
  console.log(`\nSnapshot 1 → status=${first.status} overdue=${first.overdue} ruling=${first.ruling}`);
  receipt(firstRes);

  // 3. Rule — free, but the arbiter key is required.
  const ruleRes = await fetch(`${BASE_URL}/rule/${record.caseId}`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Arbiter-Key": ARBITER_KEY },
    body: JSON.stringify({
      finding: "upheld",
      remedy: "full_refund",
      arbiter: "arbiter-1",
      rationale: "No response within the window; booking reference absent from the merchant's feed.",
    }),
  });
  if (!ruleRes.ok) {
    console.error("Ruling failed:", ruleRes.status, await ruleRes.text());
    process.exit(1);
  }
  const ruling = await ruleRes.json();
  console.log("\nSigned ruling + refund instruction:\n", JSON.stringify(ruling, null, 2));

  // 4. Poll again — the ruling is now embedded in the snapshot.
  const secondRes = await payFetch(`${BASE_URL}/cases/${record.caseId}`);
  const second = await secondRes.json();
  console.log(
    `\nSnapshot 2 → status=${second.status}`,
    "refund:",
    JSON.stringify(second.ruling?.refundInstruction),
  );
  receipt(secondRes);

  // 5. Prove the evidence, free: re-hash what you still hold.
  const proof = await (
    await fetch(`${BASE_URL}/evidence/hash`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caseId: record.caseId,
        evidence: [{ label: "booking-confirmation", content: CONFIRMATION }],
      }),
    })
  ).json();
  console.log("\nEvidence root matches what was filed:", proof.matches);

  // Signatures check out even with the `settlement` echo left in the body.
  const verified = await (
    await fetch(`${BASE_URL}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(second),
    })
  ).json();
  console.log("Snapshot signature valid:", verified.valid);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/* ---------------------------------------------------------------------------
 * Paying on the Solana rail instead
 * ---------------------------------------------------------------------------
 * Every paid route here answers with a DUAL-RAIL 402: `accepts` holds one
 * base-sepolia entry and one solana-devnet entry. `wrapFetchWithPayment` above
 * picks the EVM one. To pay from a Solana wallet, pick the other entry and
 * build the `X-PAYMENT` envelope yourself:
 *
 *   import {
 *     prepareSolanaCheckout,
 *     encodeX402Payment,
 *   } from "@three-ws/x402-payment-modal/server";
 *
 *   const res = await fetch(url, { method: "POST" });          // 402
 *   const { accepts } = await res.json();
 *   const accept = accepts.find((a) => a.network.startsWith("solana"));
 *
 *   // 1. server-side helper builds the SPL transferChecked the buyer signs.
 *   //    accept.extra.feePayer sponsors the SOL fee, so you need only USDC.
 *   const { tx_base64 } = await prepareSolanaCheckout({
 *     accept, buyer: myPubkey, rpcUrl: process.env.SOLANA_RPC_URL,
 *   });
 *
 *   // 2. sign tx_base64 with your keypair / Phantom.
 *   const signedTxBase64 = await signWithWallet(tx_base64);
 *
 *   // 3. wrap it into the x402 envelope and retry.
 *   const { x_payment } = encodeX402Payment({
 *     accept, signedTxBase64, resourceUrl: url,
 *   });
 *   const paid = await fetch(url, { method: "POST", headers: { "X-PAYMENT": x_payment } });
 *
 * In a browser the drop-in modal does all three steps for you:
 *   <script type="module" src="https://unpkg.com/@three-ws/x402-payment-modal"></script>
 *
 * The raw dual-rail 402 body, for reference:
 *
 *   $ curl -s -i -X POST http://localhost:4025/cases
 *   HTTP/1.1 402 Payment Required
 *   {
 *     "x402Version": 1,
 *     "error": "X-PAYMENT header is required",
 *     "accepts": [
 *       { "scheme": "exact", "network": "base-sepolia",  "asset": "0x036CbD…dCF7e",
 *         "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402", "maxAmountRequired": "10000" },
 *       { "scheme": "exact", "network": "solana-devnet", "asset": "4zMMC9…ncDU",
 *         "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW", "maxAmountRequired": "10000",
 *         "extra": { "feePayer": "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4" } }
 *     ]
 *   }
 * ------------------------------------------------------------------------- */
