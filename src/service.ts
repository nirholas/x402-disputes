/**
 * Arbitration logic for x402-disputes.
 *
 * A dispute is opened against a payment that actually settled: the claimant
 * names the transaction, states what went wrong, and attaches evidence. The
 * service **never stores the evidence itself** — only a SHA-256 hash per item
 * plus a combined root over the sorted hashes. That keeps receipts, screenshots
 * and message logs off this server while still letting anyone prove, later,
 * that a specific document was the one filed.
 *
 * Three moves, each returning its artifact in the response:
 *   1. POST /cases      ($0.01)  → signed case record + evidence hashes/root
 *   2. GET  /cases/:id  ($0.001) → signed status snapshot (timeline, ruling)
 *   3. POST /rule/:id   (free, arbiter-authenticated) → signed ruling +
 *                                 refund instruction naming the payee wallet
 *
 * Wallets are dual-rail throughout: a claimant, a respondent and a refund payee
 * may each be an EVM address or a Solana pubkey.
 */
import { createHash, randomUUID } from "node:crypto";
import { resignInPlace, signArtifact, type Signed } from "./sign.js";
import { loadStore, saveStore } from "./store.js";
import { parseWallet, requireWallet, walletRef, type Rail } from "./wallet.js";

export const FILING_FEE = "$0.01";
export const SNAPSHOT_PRICE = "$0.001";
export const MAX_EVIDENCE_ITEMS = 12;
export const ARBITER_KEY = process.env.ARBITER_KEY || "dev-arbiter-key";
export const RESPONSE_WINDOW_HOURS = Number(process.env.RESPONSE_WINDOW_HOURS || "72");

export type ClaimType = "not_delivered" | "partial" | "wrong_item" | "late" | "overcharged";
export type Remedy = "full_refund" | "partial_refund" | "redo" | "none";
export type CaseStatus = "open" | "awaiting_response" | "ruled" | "withdrawn";
export type Finding = "upheld" | "partially_upheld" | "dismissed";

const CLAIM_TYPES: ClaimType[] = ["not_delivered", "partial", "wrong_item", "late", "overcharged"];
const REMEDIES: Remedy[] = ["full_refund", "partial_refund", "redo", "none"];
const FINDINGS: Finding[] = ["upheld", "partially_upheld", "dismissed"];

export interface WalletRef {
  rail: Rail;
  address: string;
}

export interface EvidenceHash {
  label: string;
  /** SHA-256 of the submitted content — the content itself is never stored. */
  sha256: string;
  bytes: number;
}

export interface CaseRecord {
  caseId: string;
  document: "x402-disputes/case";
  claimant: WalletRef;
  /** Who the claim is against: a merchant id, and optionally their wallet. */
  respondent: { merchantId: string; wallet: WalletRef | null };
  disputedPayment: { rail: Rail | "unknown"; network: string; transaction: string; amount: string };
  claimType: ClaimType;
  statement: string;
  requestedRemedy: Remedy;
  evidence: EvidenceHash[];
  /** SHA-256 over the sorted item hashes — one value that fixes the whole bundle. */
  evidenceRoot: string;
  filingFee: string;
  openedAt: string;
  respondBy: string;
  status: CaseStatus;
}

export interface Ruling {
  rulingId: string;
  document: "x402-disputes/ruling";
  caseId: string;
  finding: Finding;
  remedy: Remedy;
  rationale: string;
  /** What should be paid back, to whom, on which rail. */
  refundInstruction: {
    payTo: WalletRef | null;
    amount: string;
    asset: "USDC";
    network: string;
    reference: string;
    status: "instructed" | "not_applicable";
  };
  arbiter: string;
  ruledAt: string;
}

export interface StatusSnapshot {
  caseId: string;
  document: "x402-disputes/status";
  status: CaseStatus;
  claimType: ClaimType;
  claimant: WalletRef;
  respondent: { merchantId: string; wallet: WalletRef | null };
  disputedPayment: CaseRecord["disputedPayment"];
  requestedRemedy: Remedy;
  evidenceRoot: string;
  evidenceCount: number;
  openedAt: string;
  respondBy: string;
  overdue: boolean;
  timeline: Array<{ at: string; event: string; detail: string }>;
  ruling: Signed<Ruling> | null;
  snapshotAt: string;
}

type CaseStore = Record<string, Signed<CaseRecord>>;
type RulingStore = Record<string, Signed<Ruling>>;

let cases: CaseStore = loadStore<CaseStore>("cases", {});
let rulings: RulingStore = loadStore<RulingStore>("rulings", {});

function persist(): void {
  saveStore("cases", cases);
  saveStore("rulings", rulings);
}

export class DisputeError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Hash a bundle of evidence items. Content is hashed and immediately dropped. */
export function hashEvidence(raw: unknown): { items: EvidenceHash[]; root: string } {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_EVIDENCE_ITEMS) : [];
  const items: EvidenceHash[] = list.map((entry, index) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const content =
      typeof item.content === "string"
        ? item.content
        : item.content === undefined
          ? ""
          : JSON.stringify(item.content);
    // Callers who already hashed their own document can pass sha256 directly.
    const provided = typeof item.sha256 === "string" && /^[0-9a-f]{64}$/i.test(item.sha256)
      ? item.sha256.toLowerCase()
      : null;
    return {
      label: typeof item.label === "string" ? item.label.slice(0, 80) : `evidence-${index + 1}`,
      sha256: provided ?? sha256(content),
      bytes: provided ? Number(item.bytes) || 0 : Buffer.byteLength(content, "utf8"),
    };
  });
  const root = sha256(
    items
      .map((i) => i.sha256)
      .sort()
      .join(""),
  );
  return { items, root };
}

function railOfNetwork(network: string): Rail | "unknown" {
  if (/^solana/.test(network)) return "solana";
  if (/^(base|eip155|avalanche|polygon|sei|abstract|iotex|peaq|story|educhain|skale)/.test(network)) return "evm";
  return "unknown";
}

function normalizeMerchantId(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!/^[a-z0-9][a-z0-9._:-]{1,63}$/.test(value)) {
    throw new DisputeError(
      400,
      "INVALID_MERCHANT_ID",
      "respondent.merchantId must be 2-64 chars of [a-z0-9._:-] (a domain, a payTo address, or a service slug)",
    );
  }
  return value;
}

/**
 * Open a dispute. Paid ($0.01 filing fee) — the signed case record, including
 * every evidence hash and the evidence root, is returned in this response.
 */
export function openCase(body: Record<string, unknown>): Signed<CaseRecord> {
  const claimant = requireWallet(body.claimant, "claimant");
  const respondentInput = (body.respondent ?? {}) as Record<string, unknown>;
  const merchantId = normalizeMerchantId(respondentInput.merchantId ?? body.merchantId);
  const respondentWallet = parseWallet(respondentInput.wallet);

  const paymentInput = (body.disputedPayment ?? body.payment ?? {}) as Record<string, unknown>;
  const transaction =
    typeof paymentInput.transaction === "string" && paymentInput.transaction.trim()
      ? paymentInput.transaction.trim().slice(0, 128)
      : "";
  if (!transaction) {
    throw new DisputeError(
      400,
      "MISSING_PAYMENT_TX",
      "disputedPayment.transaction is required — a dispute must name the settled payment it is about",
    );
  }
  const network = typeof paymentInput.network === "string" ? paymentInput.network.slice(0, 40) : "base-sepolia";

  const claimType = CLAIM_TYPES.includes(body.claimType as ClaimType)
    ? (body.claimType as ClaimType)
    : "not_delivered";
  const requestedRemedy = REMEDIES.includes(body.requestedRemedy as Remedy)
    ? (body.requestedRemedy as Remedy)
    : "full_refund";

  const { items, root } = hashEvidence(body.evidence);
  const now = Date.now();

  const record: CaseRecord = {
    caseId: `case_${randomUUID()}`,
    document: "x402-disputes/case",
    claimant: walletRef(claimant),
    respondent: { merchantId, wallet: respondentWallet ? walletRef(respondentWallet) : null },
    disputedPayment: {
      rail: railOfNetwork(network),
      network,
      transaction,
      amount: typeof paymentInput.amount === "string" ? paymentInput.amount.slice(0, 24) : "$0.00",
    },
    claimType,
    statement: typeof body.statement === "string" ? body.statement.slice(0, 2000) : "",
    requestedRemedy,
    evidence: items,
    evidenceRoot: root,
    filingFee: FILING_FEE,
    openedAt: new Date(now).toISOString(),
    respondBy: new Date(now + RESPONSE_WINDOW_HOURS * 3_600_000).toISOString(),
    status: "awaiting_response",
  };
  const signed = signArtifact(record);
  cases[record.caseId] = signed;
  persist();
  return signed;
}

export function caseExists(id: unknown): boolean {
  return typeof id === "string" && Boolean(cases[id]);
}

export function getCase(id: string): Signed<CaseRecord> | undefined {
  return cases[id];
}

export function getRulingFor(caseId: string): Signed<Ruling> | undefined {
  return Object.values(rulings).find((r) => r.caseId === caseId);
}

/**
 * Status snapshot. Paid ($0.001) — the snapshot is the artifact, so polling a
 * long-running dispute is a pay-per-poll read rather than a promise of a
 * later push.
 */
export function statusSnapshot(id: string): Signed<StatusSnapshot> {
  const record = cases[id];
  if (!record) throw new DisputeError(404, "CASE_NOT_FOUND", `No case ${id}`);
  const ruling = getRulingFor(id) ?? null;
  const overdue = record.status === "awaiting_response" && new Date(record.respondBy).getTime() < Date.now();

  const timeline: StatusSnapshot["timeline"] = [
    {
      at: record.openedAt,
      event: "case_opened",
      detail: `${record.claimType} against ${record.respondent.merchantId} for payment ${record.disputedPayment.transaction}`,
    },
    {
      at: record.respondBy,
      event: overdue ? "response_window_closed" : "response_due",
      detail: `${RESPONSE_WINDOW_HOURS}h response window`,
    },
  ];
  if (ruling) {
    timeline.push({
      at: ruling.ruledAt,
      event: "ruled",
      detail: `${ruling.finding} → ${ruling.remedy}`,
    });
  }
  timeline.sort((a, b) => (a.at < b.at ? -1 : 1));

  const snapshot: StatusSnapshot = {
    caseId: record.caseId,
    document: "x402-disputes/status",
    status: record.status,
    claimType: record.claimType,
    claimant: record.claimant,
    respondent: record.respondent,
    disputedPayment: record.disputedPayment,
    requestedRemedy: record.requestedRemedy,
    evidenceRoot: record.evidenceRoot,
    evidenceCount: record.evidence.length,
    openedAt: record.openedAt,
    respondBy: record.respondBy,
    overdue,
    timeline,
    ruling,
    snapshotAt: new Date().toISOString(),
  };
  return signArtifact(snapshot);
}

/**
 * Rule on a case. Free but arbiter-authenticated — the value here is the signed
 * ruling and its refund instruction, not the request.
 */
export function ruleOnCase(
  id: string,
  arbiterKey: unknown,
  body: Record<string, unknown>,
): Signed<Ruling> {
  if (typeof arbiterKey !== "string" || arbiterKey !== ARBITER_KEY) {
    throw new DisputeError(
      401,
      "ARBITER_AUTH_REQUIRED",
      "Send the arbiter key in the X-Arbiter-Key header (ARBITER_KEY env)",
    );
  }
  const record = cases[id];
  if (!record) throw new DisputeError(404, "CASE_NOT_FOUND", `No case ${id}`);
  if (record.status === "ruled") throw new DisputeError(409, "ALREADY_RULED", `Case ${id} has already been ruled on`);

  const finding = FINDINGS.includes(body.finding as Finding) ? (body.finding as Finding) : "dismissed";
  const remedy: Remedy =
    finding === "dismissed"
      ? "none"
      : REMEDIES.includes(body.remedy as Remedy)
        ? (body.remedy as Remedy)
        : record.requestedRemedy;

  const refundsMoney = remedy === "full_refund" || remedy === "partial_refund";
  const requested = Number(String(record.disputedPayment.amount).replace(/[^0-9.]/g, "")) || 0;
  const awardedRaw = Number(String(body.refundAmount ?? "").replace(/[^0-9.]/g, ""));
  const awarded = refundsMoney
    ? remedy === "full_refund"
      ? requested
      : Math.min(Number.isFinite(awardedRaw) && awardedRaw > 0 ? awardedRaw : requested / 2, requested)
    : 0;

  const ruling: Ruling = {
    rulingId: `rul_${randomUUID()}`,
    document: "x402-disputes/ruling",
    caseId: record.caseId,
    finding,
    remedy,
    rationale: typeof body.rationale === "string" ? body.rationale.slice(0, 2000) : "",
    refundInstruction: {
      payTo: refundsMoney ? record.claimant : null,
      amount: `$${awarded.toFixed(2)}`,
      asset: "USDC",
      network: record.disputedPayment.network,
      reference: `refund for case ${record.caseId} / payment ${record.disputedPayment.transaction}`,
      status: refundsMoney ? "instructed" : "not_applicable",
    },
    arbiter: typeof body.arbiter === "string" ? body.arbiter.slice(0, 80) : "arbiter",
    ruledAt: new Date().toISOString(),
  };

  record.status = "ruled";
  resignInPlace(record); // the stored case moved to "ruled" — re-sign it
  const signed = signArtifact(ruling);
  rulings[ruling.rulingId] = signed;
  persist();
  return signed;
}

/** Free index — ids and status only, no statements and no evidence hashes. */
export function caseIndex(): Array<{
  caseId: string;
  status: CaseStatus;
  claimType: ClaimType;
  merchantId: string;
  openedAt: string;
}> {
  return Object.values(cases)
    .map((c) => ({
      caseId: c.caseId,
      status: c.status,
      claimType: c.claimType,
      merchantId: c.respondent.merchantId,
      openedAt: c.openedAt,
    }))
    .sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));
}
