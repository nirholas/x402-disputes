import "dotenv/config";
import express from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { paywall, payToBanner, withSettlement } from "./payments.js";
import { ROUTE_SCHEMAS } from "./schemas.js";
import {
  ARBITER_KEY,
  caseExists,
  caseIndex,
  DisputeError,
  FILING_FEE,
  getCase,
  getRulingFor,
  hashEvidence,
  openCase,
  ruleOnCase,
  SNAPSHOT_PRICE,
  statusSnapshot,
} from "./service.js";
import { verify } from "./sign.js";
import { WalletError } from "./wallet.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 4025);

const app = express();
app.use(express.json({ limit: "512kb" })); // evidence bodies can be chunky

// ---- x402 paywall ----------------------------------------------------------
// POST /cases      → $0.01 filing fee
// GET  /cases/:id  → $0.001 per status snapshot (pay-per-poll: each read
//                    returns a fresh signed snapshot, not a promise of a push)
// Unknown case ids resolve to null so a caller gets a free 404.
app.use(
  paywall({
    "POST /cases": {
      price: FILING_FEE,
      description: "Open a dispute case with hashed evidence",
      outputSchema: ROUTE_SCHEMAS["POST /cases"],
    },
    "GET /cases/:id": (req) => {
      const id = req.path.split("/")[2] || "";
      if (!caseExists(id)) return null; // free 404
      return {
        price: SNAPSHOT_PRICE,
        description: `Status snapshot for dispute case ${id}`,
        outputSchema: ROUTE_SCHEMAS["GET /cases/:id"],
      };
    },
  }),
);

// ---- Free routes ------------------------------------------------------------
app.get("/health", (_req, res) => res.json({ ok: true, service: "x402-disputes" }));

app.get("/cases", (_req, res) => res.json({ cases: caseIndex() }));

app.get("/rulings/:caseId", (req, res) => {
  const ruling = getRulingFor(req.params.caseId);
  if (!ruling) {
    return res.status(404).json({ error: "RULING_NOT_FOUND", message: `No ruling for case ${req.params.caseId}` });
  }
  res.json(ruling);
});

/**
 * Recompute an evidence hash locally so a claimant can prove the document they
 * still hold is the one on file. Free — it is a pure function of the input.
 */
app.post("/evidence/hash", (req, res) => {
  const { items, root } = hashEvidence(req.body?.evidence);
  const record = typeof req.body?.caseId === "string" ? getCase(req.body.caseId) : undefined;
  res.json({
    items,
    root,
    ...(record
      ? {
          caseId: record.caseId,
          filedRoot: record.evidenceRoot,
          matches: record.evidenceRoot === root,
        }
      : {}),
  });
});

app.post("/verify", (req, res) => {
  const artifact = req.body;
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    return res.status(400).json({ error: "BAD_REQUEST", message: "POST a signed artifact as the JSON body" });
  }
  res.json({ valid: verify(artifact as Record<string, unknown>) });
});

// ---- Free but arbiter-authenticated ----------------------------------------
app.post("/rule/:id", (req, res) => {
  try {
    const ruling = ruleOnCase(req.params.id, req.header("X-Arbiter-Key"), req.body ?? {});
    res.status(201).json(ruling);
  } catch (err) {
    return fail(res, err);
  }
});

// ---- Paid routes ------------------------------------------------------------
app.post("/cases", (req, res) => {
  try {
    const record = openCase(req.body ?? {});
    res.status(201).json(withSettlement(record, req));
  } catch (err) {
    return fail(res, err);
  }
});

app.get("/cases/:id", (req, res) => {
  try {
    res.json(withSettlement(statusSnapshot(req.params.id), req));
  } catch (err) {
    return fail(res, err);
  }
});

function fail(res: express.Response, err: unknown): void {
  if (err instanceof WalletError || err instanceof DisputeError) {
    res.status(err.statusCode).json({ error: err.code, message: err.message });
    return;
  }
  throw err;
}

// ---- Static (includes /.well-known/x402) ------------------------------------
app.get("/.well-known/x402", (_req, res) => {
  res.type("application/json").send(readFileSync(path.join(ROOT, "public/.well-known/x402"), "utf8"));
});
app.get("/skill.md", (_req, res) => {
  res.type("text/markdown").send(readFileSync(path.join(ROOT, "skill.md"), "utf8"));
});
app.use(express.static(path.join(ROOT, "public")));

app.listen(PORT, () => {
  console.log(`x402-disputes listening on http://localhost:${PORT}`);
  console.log("  Pay in USDC on Base or Solana — your client picks the rail.");
  for (const line of payToBanner()) console.log(line);
  console.log("  Paid routes:");
  console.log(`    POST /cases                ${FILING_FEE}  -> signed case record + evidence hashes`);
  console.log(`    GET  /cases/:id            ${SNAPSHOT_PRICE} -> signed status snapshot (pay per poll)`);
  console.log("  Free routes:");
  console.log("    POST /rule/:id             arbiter-authenticated -> signed ruling + refund instruction");
  console.log("    GET  /cases                case index (ids and status only)");
  console.log("    GET  /rulings/:caseId      the signed ruling, once one exists");
  console.log("    POST /evidence/hash        recompute evidence hashes and compare to a filed root");
  console.log("    POST /verify               verify any signed artifact");
  console.log("    GET  /.well-known/x402     discovery manifest");
  if (ARBITER_KEY === "dev-arbiter-key") {
    console.log("  note: ARBITER_KEY is the public dev default — set your own before ruling on anything real");
  }
});
