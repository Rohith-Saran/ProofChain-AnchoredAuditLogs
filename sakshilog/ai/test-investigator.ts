/**
 * M3's Phase 4b deliverable: "AI test: deliberately feed the investigator tampered
 * entries, count blocked claims." Exercises checkCitations() — the citation checker that
 * is the actual enforcement point of "an AI that can only say what the blockchain can
 * prove" — with synthetic claims standing in for whatever the LLM might produce,
 * including some that cite tampered/unverified/nonexistent entries. No network call, no
 * API key needed: this tests the checker itself, not the model behind it.
 */
import { checkCitations, buildPrompt, toIncidentReport } from "./src/investigator.ts";
import type { RawClaim, InvestigatorInput } from "./src/investigator.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
}

console.log("==================================================================");
console.log("  SakshiLog AI Investigator: citation checker test (M3, Phase 4b)");
console.log("==================================================================");

// A scenario matching attack 6's shape: seq 1-2 and 4-6 verified OK, seq 3 deleted
// (flagged), seq 4-6 downstream re-chained (also flagged) — exactly the "verifier proved
// tampering, can the AI still try to assert facts about it" situation the pitch cites.
const verifiedSeqs = new Set([1, 2]);

const rawClaims: RawClaim[] = [
  // [Test 1] Clean claim citing only verified entries -> must pass.
  { text: "An SSH session was accepted for admin from 192.168.1.15.", citedEntries: [1] },
  // [Test 2] Claim mixing a verified entry with a tampered one -> must be blocked whole,
  // not trimmed down to just the verified citation.
  { text: "The sudo command that followed the login was altered.", citedEntries: [1, 3] },
  // [Test 3] Claim citing only a tampered/flagged entry -> must be blocked.
  { text: "Entry 3 shows the attacker ran a cleanup script.", citedEntries: [3] },
  // [Test 4] Claim citing a seq that doesn't exist in this scenario at all -> must be
  // blocked (hallucinated citation).
  { text: "Entry 999 confirms data exfiltration occurred.", citedEntries: [999] },
  // [Test 5] Second clean claim, different verified seq -> must pass.
  { text: "A follow-up privileged session was opened for admin.", citedEntries: [2] },
  // [Test 6] No citation at all -> must be silently dropped (counted as neither).
  { text: "Something suspicious seems to have happened.", citedEntries: [] },
];

const { claims, blockedClaims } = checkCitations(rawClaims, verifiedSeqs);

console.log(`\n[Test] ${claims.length} claims passed, ${blockedClaims.length} blocked, 1 dropped (no citation)`);
assert(claims.length === 2, `expected 2 passed claims, got ${claims.length}`);
assert(blockedClaims.length === 3, `expected 3 blocked claims, got ${blockedClaims.length}`);
assert(claims.every((c) => c.citedEntries.every((s) => verifiedSeqs.has(s))), "a passed claim cited a non-verified seq");
assert(blockedClaims.some((c) => c.citedEntries.includes(3)), "expected a blocked claim citing tampered seq 3");
assert(blockedClaims.some((c) => c.citedEntries.includes(999)), "expected a blocked claim citing nonexistent seq 999");
console.log("  ✓ clean claims pass, mixed/tampered/hallucinated claims are blocked whole, uncited text is dropped");

// [Test 7] A claim citing a mix of two valid seqs passes (not an off-by-one on >1 citation).
const multiCiteReport = checkCitations(
  [{ text: "Two logins from the same host.", citedEntries: [1, 2] }],
  verifiedSeqs
);
assert(multiCiteReport.claims.length === 1 && multiCiteReport.blockedClaims.length === 0, "multi-citation clean claim should pass");
console.log("  ✓ a claim citing more than one verified entry still passes");

// [Test 8] toIncidentReport() wires checkCitations into the full IncidentReport shape.
const report = toIncidentReport(rawClaims, verifiedSeqs, 1_700_000_000_000);
assert(report.claims.length === 2 && report.blockedClaims.length === 3, "toIncidentReport should match checkCitations' split");
assert(report.generatedAt === 1_700_000_000_000, "toIncidentReport should pass through generatedAt");
console.log("  ✓ toIncidentReport() produces the correct { claims, blockedClaims, generatedAt } shape");

// [Test 9] buildPrompt(): verified entries are listed as citable fact, flagged entries are
// listed separately with an explicit warning, and an empty list renders as "(none)" rather
// than a blank section (an LLM given no verified entries at all should have nothing to
// safely cite, and the prompt should say so plainly).
const promptInput: InvestigatorInput = {
  verifiedEntries: [{ seq: 1, ts: 1_700_000_000_000, source: "auth", level: "info", message: "Accepted publickey for admin" }],
  flaggedEntries: [{ seq: 3, verdict: "DELETED", detail: "Entry seq 3 is missing locally but present in the off-host collector" }],
  silence: { triggered: false, secondsSinceLastAnchor: 4 },
  summary: { total: 2, tamperedCount: 1, ok: false },
};
const prompt = buildPrompt(promptInput);
assert(prompt.includes("[seq 1]") && prompt.includes("Accepted publickey for admin"), "prompt should list verified entry 1 with its message");
assert(prompt.includes("[seq 3]") && prompt.includes("DELETED"), "prompt should list flagged entry 3 with its verdict");
assert(prompt.includes("No silence alert is active."), "silence=false should render as no-alert");

const emptyPrompt = buildPrompt({ verifiedEntries: [], flaggedEntries: [], silence: { triggered: true, secondsSinceLastAnchor: 42 }, summary: { total: 0, tamperedCount: 0, ok: true } });
assert(emptyPrompt.includes("(none)"), "an empty verified/flagged list should render as (none), not blank");
assert(emptyPrompt.includes("ANCHOR_SILENCE is currently triggered"), "silence=true should render the alert line");
console.log("  ✓ buildPrompt() correctly separates citable (verified) context from flagged-only context");

console.log("\n==================================================================");
console.log("  ALL AI INVESTIGATOR CITATION-CHECKER TESTS PASSED");
console.log("==================================================================");
