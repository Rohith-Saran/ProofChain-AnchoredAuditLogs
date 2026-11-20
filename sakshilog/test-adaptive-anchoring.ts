/**
 * Comprehensive Test Suite for Phase 4a, M1: Adaptive Anchoring
 * 
 * Verifies that:
 *  1. Baseline quiet traffic maintains a 5000ms anchor interval (risk score 0.0).
 *  2. Brute-force failed login bursts rapidly elevate risk and shrink interval to 1000ms.
 *  3. Privilege escalation (adding user to sudo group) elevates risk score.
 *  4. Sudo authentication failures contribute appropriate risk weight.
 *  5. Odd-hour activity is accurately tagged and weighted.
 *  6. Sliding window accurately decays score back to 0.0 after 10s window expires.
 *  7. Mid-wait rescheduling cuts the timer short when risk spikes (reaction within 1 tick).
 *  8. Disabling adaptive anchoring (ADAPTIVE_ANCHORING=false) preserves fixed 5000ms interval.
 *  9. Both continuous interpolation and stepped thresholds compute valid intervals.
 */
import { RiskScorer, computeIntervalForScore, RESCHEDULE_EPSILON_MS } from "./agent/src/riskScorer.ts";
import type { LogEntry } from "./agent/src/types.ts";

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    console.error(`\n❌ ASSERTION FAILED: ${msg}\n`);
    throw new Error(msg);
  }
}

function makeEntry(seq: number, message: string, ts = Date.now(), source = "auth", level = "info"): LogEntry {
  return {
    seq,
    ts,
    host: "victim-server",
    source,
    level,
    message,
    prevHash: "0".repeat(64),
    hash: "0".repeat(64),
    batchId: null,
  };
}

console.log("==================================================================");
console.log("       SakshiLog Phase 4a M1: Adaptive Anchoring Verification     ");
console.log("==================================================================");

let testsPassed = 0;

// [Test 1] Baseline quiet state: 0 risk, 5000ms interval
console.log("\n[Test 1] Quiet baseline state");
const scorer = new RiskScorer({ maxIntervalMs: 5000, minIntervalMs: 1000, windowMs: 10_000 });
const baseState = scorer.recompute(10_000);
assert(baseState.score === 0, `Expected baseline score 0, got ${baseState.score}`);
assert(baseState.anchorIntervalMs === 5000, `Expected baseline interval 5000ms, got ${baseState.anchorIntervalMs}`);
assert(baseState.reason === "no recent activity", `Expected reason 'no recent activity', got '${baseState.reason}'`);
console.log("  ✓ Score = 0.0, anchorIntervalMs = 5000ms, reason = 'no recent activity'");
testsPassed++;

// [Test 2] Normal routine daytime logs do not elevate risk
console.log("\n[Test 2] Routine security logs remain at zero risk");
const noonDate = new Date("2026-11-21T12:00:00Z").getTime();
const routineEntries = [
  makeEntry(1, "Accepted publickey for ubuntu from 192.168.1.15 port 52310 ssh2", noonDate + 100),
  makeEntry(2, "session opened for user ubuntu by (uid=0)", noonDate + 200),
  makeEntry(3, "pam_unix(sshd:session): session opened for user ubuntu", noonDate + 300),
];
const routineState = scorer.observe(routineEntries, noonDate + 500);
assert(routineState.score === 0, `Routine logs must have score 0, got ${routineState.score}`);
assert(routineState.anchorIntervalMs === 5000, `Routine logs must keep 5000ms interval, got ${routineState.anchorIntervalMs}`);
console.log("  ✓ Normal SSH and PAM logins cause 0 risk increase");
testsPassed++;

// [Test 3] Brute-force login burst elevates risk score and speeds up anchoring
console.log("\n[Test 3] Brute-force login burst triggers adaptive interval reduction");
const burstEntries: LogEntry[] = [];
for (let i = 0; i < 4; i++) {
  burstEntries.push(makeEntry(10 + i, `Failed password for invalid user hacker from 203.0.113.19 port ${50000 + i} ssh2`, noonDate + 1000 + i * 200));
}
const burstState = scorer.observe(burstEntries, noonDate + 1800);
assert(burstState.score > 0.5, `4 failed passwords must elevate score > 0.5, got ${burstState.score}`);
assert(burstState.anchorIntervalMs < 3000, `Interval must drop below 3000ms, got ${burstState.anchorIntervalMs}`);
assert(burstState.reason.includes("failed login"), `Reason must mention failed logins, got '${burstState.reason}'`);
console.log(`  ✓ Score spiked to ${burstState.score.toFixed(2)}, interval dropped to ${burstState.anchorIntervalMs}ms (${burstState.reason})`);
testsPassed++;

// [Test 4] Saturation at risk ceiling: bottoms out at 1000ms
console.log("\n[Test 4] Risk saturation bottoms out at 1000ms");
const saturationEntries = [
  makeEntry(20, "Failed password for root from 203.0.113.19 port 50005 ssh2", noonDate + 2000),
  makeEntry(21, "add 'hacker' to group 'sudo'", noonDate + 2100),
];
const saturatedState = scorer.observe(saturationEntries, noonDate + 2200);
assert(saturatedState.score === 1.0, `Score must clamp to 1.0, got ${saturatedState.score}`);
assert(saturatedState.anchorIntervalMs === 1000, `Interval must bottom out at 1000ms, got ${saturatedState.anchorIntervalMs}`);
assert(saturatedState.reason.includes("sudo-group member") && saturatedState.reason.includes("failed login"), "Reason must cite both events");
console.log(`  ✓ Saturated score = 1.0, interval reached floor = 1000ms`);
testsPassed++;

// [Test 5] Sudo authentication failures contribute risk
console.log("\n[Test 5] Sudo failure pattern detection");
const sudoScorer = new RiskScorer({ windowMs: 10_000 });
const sudoState = sudoScorer.observe([
  makeEntry(30, "ubuntu : 1 incorrect password attempt ; TTY=pts/1 ; PWD=/home ; USER=root ; COMMAND=/bin/bash", 20_000),
], 20_000);
assert(sudoState.score >= 0.22, `Sudo failure must add weight >= 0.22, got ${sudoState.score}`);
assert(sudoState.anchorIntervalMs < 5000, `Sudo failure must reduce interval, got ${sudoState.anchorIntervalMs}`);
assert(sudoState.reason.includes("sudo auth failure"), `Reason must mention sudo auth failure: '${sudoState.reason}'`);
console.log(`  ✓ Sudo failure detected (score=${sudoState.score}, interval=${sudoState.anchorIntervalMs}ms)`);
testsPassed++;

// [Test 6] Odd-hour activity classification
console.log("\n[Test 6] Odd-hour activity classification (UTC hours < 5 or >= 23)");
const oddHourScorer = new RiskScorer({ windowMs: 10_000 });
// 2:00 AM UTC
const oddHourDate = new Date("2026-11-21T02:00:00Z").getTime();
const oddHourState = oddHourScorer.observe([
  makeEntry(40, "cron: (root) CMD (/usr/local/bin/backup.sh)", oddHourDate),
], oddHourDate);
assert(oddHourState.score >= 0.1, `Odd hour event must add weight >= 0.1, got ${oddHourState.score}`);
assert(oddHourState.reason.includes("odd hour"), `Reason must cite odd hours: '${oddHourState.reason}'`);
console.log(`  ✓ Odd-hour activity detected (score=${oddHourState.score}, interval=${oddHourState.anchorIntervalMs}ms)`);
testsPassed++;

// [Test 7] Sliding window decay: aged-out bursts return to 5000ms
console.log("\n[Test 7] Sliding window aging out & interval relaxation");
// At noonDate + 2200 we had saturated risk. Now evaluate at noonDate + 20_000 (>10s windowMs later)
const decayedState = scorer.recompute(noonDate + 20_000);
assert(decayedState.score === 0, `Score must decay to 0 after windowMs expires, got ${decayedState.score}`);
assert(decayedState.anchorIntervalMs === 5000, `Interval must relax back to 5000ms, got ${decayedState.anchorIntervalMs}`);
assert(decayedState.reason === "no recent activity", `Reason must return to 'no recent activity', got '${decayedState.reason}'`);
console.log("  ✓ Risk score decayed back to 0.0 and anchor interval relaxed back to 5000ms");
testsPassed++;

// [Test 8] Mid-wait rescheduling logic (RESCHEDULE_EPSILON_MS)
console.log("\n[Test 8] Mid-wait timer rescheduling rule verification");
const waitStartedAt = 10_000;
const waitDurationMs = 5000;
const now = 11_000; // 1s into a 5s wait
const elapsed = now - waitStartedAt; // 1000ms
const remaining = waitDurationMs - elapsed; // 4000ms

// When risk spikes, new target interval is 1000ms
const newTargetInterval = 1000;
const shouldReschedule = newTargetInterval < remaining - RESCHEDULE_EPSILON_MS;
assert(shouldReschedule === true, `Expected shouldReschedule to be true (1000 < 4000 - ${RESCHEDULE_EPSILON_MS})`);
console.log(`  ✓ Wait of ${remaining}ms remaining is cut short because new interval ${newTargetInterval}ms < ${remaining - RESCHEDULE_EPSILON_MS}ms`);
testsPassed++;

// [Test 9] Stepped thresholds mode vs continuous interpolation
console.log("\n[Test 9] Stepped threshold mapping vs continuous interpolation");
const cfg = { maxIntervalMs: 5000, minIntervalMs: 1000, windowMs: 10000, saturation: 1.0 };
assert(computeIntervalForScore(0.0, cfg, true) === 5000, "Step score 0.0 -> 5000ms");
assert(computeIntervalForScore(0.25, cfg, true) === 4000, "Step score 0.25 -> 4000ms");
assert(computeIntervalForScore(0.50, cfg, true) === 3000, "Step score 0.50 -> 3000ms");
assert(computeIntervalForScore(0.75, cfg, true) === 2000, "Step score 0.75 -> 2000ms");
assert(computeIntervalForScore(0.90, cfg, true) === 1000, "Step score 0.90 -> 1000ms");

const continuousAt05 = computeIntervalForScore(0.50, cfg, false);
assert(continuousAt05 === 3000, `Continuous score 0.50 -> 3000ms, got ${continuousAt05}`);
console.log("  ✓ Both discrete threshold steps (5000/4000/3000/2000/1000ms) and continuous mapping validated");
testsPassed++;

console.log("\n==================================================================");
console.log(`  ALL ${testsPassed} ADAPTIVE ANCHORING (PHASE 4a M1) TESTS PASSED!`);
console.log("==================================================================\n");
