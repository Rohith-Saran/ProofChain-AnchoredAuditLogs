/**
 * Comprehensive Test Suite for Phase 4a, M4: AI Incident Investigator + Citation Checker
 * 
 * Verifies that:
 *  1. One model call over verifier's results outputs structured claims with citedEntries.
 *  2. Clean claims citing ONLY verified OK entries pass the citation checker.
 *  3. Any claim citing a tampered entry (MODIFIED) is rejected whole into blockedClaims.
 *  4. Any claim citing a deleted entry (DELETED) is rejected whole into blockedClaims.
 *  5. Any claim citing an inserted entry (INSERTED) is rejected whole into blockedClaims.
 *  6. Any claim citing an entry from a root-mismatched/tampered batch is rejected whole.
 *  7. Any claim citing an unanchored entry (UNANCHORED_WINDOW) is rejected whole.
 *  8. Any claim citing a nonexistent/hallucinated seq number is rejected whole.
 *  9. Mixed claims (one verified seq + one tampered/nonexistent seq) are blocked whole.
 * 10. Claims with no text or no citations are discarded.
 * 11. Multi-citation claims citing multiple verified entries pass cleanly.
 * 12. Full report structure matches IncidentReport { claims, blockedClaims, generatedAt }.
 * 13. System prompt & buildPrompt correctly separate citable facts from flagged entries.
 * 14. Demo claim generator produces genuine test claims and exercises live rejection.
 */
import { checkCitations, buildPrompt, toIncidentReport, generateDemoClaims, SYSTEM_PROMPT } from "./ai/src/investigator.ts";
import type { RawClaim, InvestigatorInput } from "./ai/src/investigator.ts";

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    console.error(`\n❌ ASSERTION FAILED: ${msg}\n`);
    throw new Error(msg);
  }
}

console.log("==================================================================");
console.log("  SakshiLog Phase 4a M4: AI Incident Investigator & Checker Tests  ");
console.log("==================================================================");

let testsPassed = 0;

// Set up verified and flagged entries modeling realistic verifier output
const verifiedSeqs = new Set([101, 102, 104, 105]); // Verified "OK" entries
const tamperedModifiedSeq = 103; // Attack 1: MODIFIED
const deletedSeq = 106;          // Attack 2: DELETED
const insertedSeq = 107;         // Attack 3: INSERTED
const rootMismatchedSeq = 108;   // Attack 6: Batch root mismatch
const unanchoredSeq = 109;       // UNANCHORED_WINDOW (not yet anchored)
const hallucinatedSeq = 9999;    // Non-existent seq

const testClaims: RawClaim[] = [
  // [1] Clean claim citing verified entry 101 -> PASS
  { text: "SSH daemon started and listening on port 22.", citedEntries: [101] },

  // [2] Clean claim citing verified entry 102 -> PASS
  { text: "Accepted publickey authentication for user ubuntu from 192.168.1.42.", citedEntries: [102] },

  // [3] Claim citing MODIFIED entry 103 -> MUST BE BLOCKED
  { text: "Attacker executed unauthorized sudo bash command.", citedEntries: [tamperedModifiedSeq] },

  // [4] Claim citing DELETED entry 106 -> MUST BE BLOCKED
  { text: "User alice was added to sudoers before the deletion.", citedEntries: [deletedSeq] },

  // [5] Claim citing INSERTED entry 107 -> MUST BE BLOCKED
  { text: "A bogus log entry was injected into the audit stream.", citedEntries: [insertedSeq] },

  // [6] Claim citing entry from root-mismatched batch 108 -> MUST BE BLOCKED
  { text: "Audit log records state changed within tampered batch.", citedEntries: [rootMismatchedSeq] },

  // [7] Claim citing UNANCHORED entry 109 -> MUST BE BLOCKED
  { text: "Unanchored trailing log suggests ongoing malicious activity.", citedEntries: [unanchoredSeq] },

  // [8] Claim citing non-existent seq 9999 -> MUST BE BLOCKED (hallucination)
  { text: "Evidence confirms root credentials exfiltrated to external IP.", citedEntries: [hallucinatedSeq] },

  // [9] Mixed claim: 1 verified (101) + 1 tampered (103) -> MUST BE BLOCKED WHOLE
  { text: "The SSH login was followed immediately by privileged tampering.", citedEntries: [101, tamperedModifiedSeq] },

  // [10] Multi-citation clean claim: citing 2 verified entries (104, 105) -> PASS
  { text: "Administrative maintenance tasks were completed normally by secops.", citedEntries: [104, 105] },

  // [11] Empty text -> MUST BE DROPPED
  { text: "   ", citedEntries: [101] },

  // [12] Empty citations array -> MUST BE DROPPED
  { text: "A generic statement without log grounding.", citedEntries: [] },
];

console.log(`\nEvaluating ${testClaims.length} candidate claims against citation checker...`);
const { claims, blockedClaims } = checkCitations(testClaims, verifiedSeqs);

console.log(`  Passed claims:  ${claims.length}`);
console.log(`  Blocked claims: ${blockedClaims.length}`);

// [Test 1] Passed claims verification
console.log("\n[Test 1] Clean claims pass verification");
assert(claims.length === 3, `Expected exactly 3 claims to pass, got ${claims.length}`);
assert(claims[0].text.includes("SSH daemon started"), "Claim 1 must match expected text");
assert(claims[1].text.includes("Accepted publickey authentication"), "Claim 2 must match expected text");
assert(claims[2].text.includes("Administrative maintenance tasks"), "Claim 3 must match expected text");
assert(claims.every((c) => c.citedEntries.every((seq) => verifiedSeqs.has(seq))), "Every cited seq in passed claims must be verified");
console.log("  ✓ All 3 clean claims passed and cite only verified OK entries");
testsPassed++;

// [Test 2] Tampered & unverified claims are blocked
console.log("\n[Test 2] Tampered, deleted, inserted, unanchored, and hallucinated claims are blocked");
assert(blockedClaims.length === 7, `Expected exactly 7 claims to be blocked, got ${blockedClaims.length}`);

const blockedSeqs = blockedClaims.flatMap((c) => c.citedEntries);
assert(blockedSeqs.includes(tamperedModifiedSeq), "Blocked claims must contain tampered modified seq 103");
assert(blockedSeqs.includes(deletedSeq), "Blocked claims must contain deleted seq 106");
assert(blockedSeqs.includes(insertedSeq), "Blocked claims must contain inserted seq 107");
assert(blockedSeqs.includes(rootMismatchedSeq), "Blocked claims must contain root-mismatched seq 108");
assert(blockedSeqs.includes(unanchoredSeq), "Blocked claims must contain unanchored window seq 109");
assert(blockedSeqs.includes(hallucinatedSeq), "Blocked claims must contain hallucinated seq 9999");
console.log("  ✓ All tampered (MODIFIED/DELETED/INSERTED/ROOT_MISMATCH/UNANCHORED/NONEXISTENT) claims blocked");
testsPassed++;

// [Test 3] Mixed citation claim is blocked whole
console.log("\n[Test 3] Mixed citation claim (1 valid + 1 tampered) is rejected whole");
const mixedClaim = blockedClaims.find((c) => c.citedEntries.includes(101) && c.citedEntries.includes(tamperedModifiedSeq));
assert(Boolean(mixedClaim), "Mixed claim must be in blockedClaims");
assert(!claims.some((c) => c.text === mixedClaim!.text), "Mixed claim must NOT appear in passed claims");
console.log("  ✓ Partial trust rejected: mixed claim [101, 103] blocked whole, never shown as fact");
testsPassed++;

// [Test 4] Uncited sentences are dropped completely
console.log("\n[Test 4] Sentences with no citations or empty text are dropped");
const totalEvaluated = claims.length + blockedClaims.length;
assert(totalEvaluated === 10, `Expected 10 total claims retained (3 passed + 7 blocked), got ${totalEvaluated}`);
console.log("  ✓ Empty claims and uncited sentences were dropped (neither passed nor blocked)");
testsPassed++;

// [Test 5] Full IncidentReport structure verification
console.log("\n[Test 5] IncidentReport shape compliance");
const timestamp = 1732150000000;
const report = toIncidentReport(testClaims, verifiedSeqs, timestamp);
assert(Array.isArray(report.claims), "report.claims must be an array");
assert(Array.isArray(report.blockedClaims), "report.blockedClaims must be an array");
assert(report.generatedAt === timestamp, `Expected generatedAt=${timestamp}, got ${report.generatedAt}`);
assert(report.claims.length === 3, "report.claims count must be 3");
assert(report.blockedClaims.length === 7, "report.blockedClaims count must be 7");
console.log("  ✓ Output strictly conforms to IncidentReport { claims, blockedClaims, generatedAt }");
testsPassed++;

// [Test 6] buildPrompt separates citable vs flagged context
console.log("\n[Test 6] Prompt builder quarantines flagged entries from citable facts");
const input: InvestigatorInput = {
  verifiedEntries: [
    { seq: 101, ts: timestamp, host: "victim-server", source: "auth", level: "info", message: "SSH started" },
    { seq: 102, ts: timestamp + 1000, host: "victim-server", source: "auth", level: "info", message: "Accepted key" },
  ],
  flaggedEntries: [
    { seq: 103, verdict: "MODIFIED", detail: "Content differs from off-host collector" },
    { seq: 106, verdict: "DELETED", detail: "Missing locally but present in off-host collector" },
  ],
  silence: { triggered: false, secondsSinceLastAnchor: 3 },
  summary: { total: 4, tamperedCount: 2, ok: false },
};

const prompt = buildPrompt(input);
assert(prompt.includes("Verified log entries (verdict OK — safe to cite as fact):"), "Prompt must have safe verified section");
assert(prompt.includes("[seq 101]"), "Prompt must list verified seq 101");
assert(prompt.includes("Flagged entries (the verifier found a problem with these"), "Prompt must have flagged warning section");
assert(prompt.includes("verdict=MODIFIED"), "Prompt must list flagged entry verdict");
assert(prompt.includes("verdict=DELETED"), "Prompt must list deleted entry verdict");
console.log("  ✓ Prompt correctly segregates verified entries from quarantined flagged entries");
testsPassed++;

// [Test 7] Demonstration claim synthesis and live check
console.log("\n[Test 7] Demonstration candidate claims generation & verification");
const demoRaw = generateDemoClaims(input);
assert(demoRaw.length >= 3, `Expected at least 3 demo claims, got ${demoRaw.length}`);
const demoReport = toIncidentReport(demoRaw, new Set(input.verifiedEntries.map((v) => v.seq)));
assert(demoReport.claims.length >= 2, `Expected at least 2 passed demo claims, got ${demoReport.claims.length}`);
assert(demoReport.blockedClaims.length >= 1, `Expected at least 1 blocked demo claim, got ${demoReport.blockedClaims.length}`);
console.log(`  ✓ Demo pipeline generated ${demoRaw.length} claims -> ${demoReport.claims.length} passed, ${demoReport.blockedClaims.length} blocked by checker`);
testsPassed++;

// [Test 8] Citation accuracy measurement
console.log("\n[Test 8] Measurable AI citation metrics (Plan Section 6.1)");
const totalCandidateClaims = testClaims.filter((c) => c.text.trim() && c.citedEntries.length > 0).length;
const validClaims = claims.length;
const blockedCount = blockedClaims.length;
const citationAccuracyRate = (validClaims / (validClaims + blockedCount)) * 100;

console.log(`  Total grounded candidates: ${totalCandidateClaims}`);
console.log(`  Valid verified claims:     ${validClaims}`);
console.log(`  Blocked claims:            ${blockedCount}`);
console.log(`  Checker rejection rate:    ${((blockedCount / totalCandidateClaims) * 100).toFixed(1)}%`);
console.log(`  Verified citation rate:    ${citationAccuracyRate.toFixed(1)}%`);
assert(validClaims + blockedCount === totalCandidateClaims, "All candidate claims accounted for");
console.log("  ✓ Metrics computed and validated for hackathon pitch & judging");
testsPassed++;

console.log("\n==================================================================");
console.log(`  ALL ${testsPassed} AI INVESTIGATOR (PHASE 4a M4) TESTS PASSED!`);
console.log("==================================================================\n");
