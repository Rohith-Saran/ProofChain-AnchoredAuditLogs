/**
 * Benchmark runner (Phase 4, "the 20 points"): for each of attacks 1-6, run 20 trials at
 * random positions against a disposable in-memory scenario, baseline (plain hash chain)
 * vs SakshiLog (full verifier). Also measures false positives on clean runs and silence
 * detection timing. Writes bench/results/results.json and bench/results/results.md.
 *
 * Runs entirely against the pure verifyLogs()/verifyBaseline() functions — no live chain
 * or SQLite file needed, so it's fast and reproducible. attacks/ exercises the same
 * attack semantics against a real running agent + chain for the live demo; attack 7
 * (kill the agent) and attack 8 (steal the key) are operational / contract-level and are
 * validated live by attacks/src/07-kill-agent.ts, attacks/src/08-steal-key-overwrite.ts
 * and anchor-service's smoke test, not by this in-memory loop.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { verifyLogs, verifyBaseline } from "../../verifier/src/verifier.ts";
import type { Verdict } from "../../verifier/src/types.ts";
import { buildScenario, clone } from "./scenario.ts";
import { ATTACKS } from "./attackScenarios.ts";

const RUNS_PER_ATTACK = 20;
const CLEAN_RUNS = 20;
const SCENARIO_SIZE = 200;
const BATCH_SIZE = 50;
const ANCHOR_INTERVAL_MS = 5000;

interface AttackStats {
  id: number;
  name: string;
  runs: number;
  baselineDetected: number;
  sakshiDetected: number;
  verdictCorrect: number;
  latenciesMs: number[];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function round(n: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function runAttackTrials(): AttackStats[] {
  const stats: AttackStats[] = [];

  for (const attack of ATTACKS) {
    const s: AttackStats = { id: attack.id, name: attack.name, runs: 0, baselineDetected: 0, sakshiDetected: 0, verdictCorrect: 0, latenciesMs: [] };

    for (let trial = 0; trial < RUNS_PER_ATTACK; trial++) {
      const scenario = buildScenario(SCENARIO_SIZE, BATCH_SIZE);
      const collectorEntries = clone(scenario.entries);
      const outcome = attack.run(scenario.entries);

      const baseline = verifyBaseline(outcome.local);
      const baselineDetected = !baseline.ok;

      const nowMs = (scenario.batches[scenario.batches.length - 1].timestamp! + 1) * 1000;
      const t0 = performance.now();
      const result = verifyLogs({
        localEntries: outcome.local,
        collectorEntries,
        batches: scenario.batches,
        anchorIntervalMs: ANCHOR_INTERVAL_MS,
        nowMs,
      });
      const latencyMs = performance.now() - t0;

      const sakshiDetected = result.summary.tamperedCount > 0;
      const verdictCorrect = outcome.affectedSeqs.every((seq) => {
        const ev = result.entries.find((e) => e.seq === seq);
        return !!ev && ev.verdict === outcome.expectedVerdict;
      });

      s.runs++;
      if (baselineDetected) s.baselineDetected++;
      if (sakshiDetected) s.sakshiDetected++;
      if (verdictCorrect) s.verdictCorrect++;
      s.latenciesMs.push(latencyMs);
    }

    stats.push(s);
  }

  return stats;
}

function runFalsePositiveTrials(): { runs: number; falsePositives: number; falsePositiveSeqs: number[] } {
  let falsePositives = 0;
  const falsePositiveSeqs: number[] = [];

  for (let trial = 0; trial < CLEAN_RUNS; trial++) {
    const scenario = buildScenario(SCENARIO_SIZE, BATCH_SIZE);
    const collectorEntries = clone(scenario.entries);
    const localEntries = clone(scenario.entries);
    const nowMs = (scenario.batches[scenario.batches.length - 1].timestamp! + 1) * 1000;

    const result = verifyLogs({ localEntries, collectorEntries, batches: scenario.batches, anchorIntervalMs: ANCHOR_INTERVAL_MS, nowMs });
    if (result.summary.tamperedCount > 0) {
      falsePositives++;
      falsePositiveSeqs.push(...result.entries.filter((e) => e.verdict !== "OK" && e.verdict !== "UNANCHORED_WINDOW").map((e) => e.seq));
    }
  }

  return { runs: CLEAN_RUNS, falsePositives, falsePositiveSeqs };
}

interface SilenceTrial {
  idleSeconds: number;
  expectedTriggered: boolean;
  actualTriggered: boolean;
  pass: boolean;
}

function runSilenceTrials(): SilenceTrial[] {
  const scenario = buildScenario(40, 20);
  const lastBatch = scenario.batches[scenario.batches.length - 1];
  const thresholdSeconds = (2 * ANCHOR_INTERVAL_MS) / 1000;
  const idleGaps = [0, 2, 4, 6, 8, 9, 10, 11, 12, 15, 20, 30, 45, 60];

  return idleGaps.map((idleSeconds) => {
    const nowMs = (lastBatch.timestamp! + idleSeconds) * 1000;
    const result = verifyLogs({
      localEntries: clone(scenario.entries),
      collectorEntries: clone(scenario.entries),
      batches: scenario.batches,
      anchorIntervalMs: ANCHOR_INTERVAL_MS,
      nowMs,
    });
    const expectedTriggered = idleSeconds > thresholdSeconds;
    return { idleSeconds, expectedTriggered, actualTriggered: result.silence.triggered, pass: expectedTriggered === result.silence.triggered };
  });
}

function formatMatrixRow(s: AttackStats, idx: number): string {
  const label = ["Edit a line (change attacker's IP)", "Delete a line (the sudo entry)", "Insert a fake line", "Reorder lines", "Truncate the tail", "Delete a line and recompute every hash after it"][idx];
  const baselinePct = round((100 * s.baselineDetected) / s.runs, 0);
  const sakshiPct = round((100 * s.sakshiDetected) / s.runs, 0);
  const avgLatency = round(s.latenciesMs.reduce((a, b) => a + b, 0) / s.latenciesMs.length, 3);
  const baselineCol = baselinePct === 100 ? "Caught" : baselinePct === 0 ? "Missed" : `${baselinePct}% caught`;
  return `| ${s.id} | ${label} | ${baselineCol} | ${sakshiPct}% (${s.verdictCorrect}/${s.runs} correct verdict) | ${avgLatency} ms |`;
}

function main() {
  console.log("==================================================================");
  console.log("  SakshiLog Benchmark: attacks 1-6, 20 runs each, baseline vs SakshiLog");
  console.log("==================================================================");

  const attackStats = runAttackTrials();
  for (const s of attackStats) {
    console.log(
      `  Attack ${s.id} ${s.name}: baseline ${s.baselineDetected}/${s.runs} caught, ` +
      `SakshiLog ${s.sakshiDetected}/${s.runs} caught (${s.verdictCorrect}/${s.runs} correct verdict)`
    );
  }

  console.log("\n  Clean runs (false positive check)...");
  const fp = runFalsePositiveTrials();
  console.log(`  ${fp.falsePositives}/${fp.runs} clean runs raised a false tamper alert (target 0)`);

  console.log("\n  Silence detection timing...");
  const silence = runSilenceTrials();
  const silencePass = silence.filter((t) => t.pass).length;
  console.log(`  ${silencePass}/${silence.length} idle-gap checks correct`);

  const generatedAt = new Date().toISOString();
  const resultsJson = {
    generatedAt,
    config: { runsPerAttack: RUNS_PER_ATTACK, cleanRuns: CLEAN_RUNS, scenarioSize: SCENARIO_SIZE, batchSize: BATCH_SIZE, anchorIntervalMs: ANCHOR_INTERVAL_MS },
    attacks: attackStats.map((s) => ({
      id: s.id,
      name: s.name,
      runs: s.runs,
      baselineDetectionRate: round(s.baselineDetected / s.runs, 3),
      sakshiDetectionRate: round(s.sakshiDetected / s.runs, 3),
      sakshiVerdictAccuracy: round(s.verdictCorrect / s.runs, 3),
      avgLatencyMs: round(s.latenciesMs.reduce((a, b) => a + b, 0) / s.latenciesMs.length, 4),
      p95LatencyMs: round(percentile([...s.latenciesMs].sort((a, b) => a - b), 0.95), 4),
    })),
    falsePositives: fp,
    silence,
    notes: [
      "Attack 7 (kill the agent) and attack 8 (steal the key, overwrite a batch) are operational / contract-level, not per-entry — validated live by attacks/src/07-kill-agent.ts, attacks/src/08-steal-key-overwrite.ts, and anchor-service's smoke test.",
      "Latency here is verifyLogs()'s own compute time against an in-memory scenario (sub-millisecond); it does not include the agent's anchor interval or network round trips. Exposure window and real end-to-end throughput are measured against the live pipeline (see implementation/PROGRESS.md, M1 log).",
    ],
  };

  const resultsDir = path.resolve(import.meta.dirname, "../results");
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(path.join(resultsDir, "results.json"), JSON.stringify(resultsJson, null, 2), "utf-8");

  const md = `# SakshiLog benchmark results

Generated ${generatedAt}. ${RUNS_PER_ATTACK} runs per attack, random position each run, on a fresh ${SCENARIO_SIZE}-entry / ${SCENARIO_SIZE / BATCH_SIZE}-batch scenario. Baseline = plain hash chain only (no blockchain, no off-host collector). SakshiLog = full verifier (on-chain Merkle root + off-host collector cross-check).

## Attack matrix (measured)

| # | Attack (run as root) | Plain hash chain | SakshiLog verdict | Avg detection latency |
|---|---|---|---|---|
${attackStats.map((s, i) => formatMatrixRow(s, i)).join("\n")}
| 7 | Kill the agent | Missed | ANCHOR_SILENCE (validated live — see silence timing below) | n/a here |
| 8 | Steal anchor key, overwrite an old batch | n/a | Rejected by contract (validated live — anchor-service smoke test + attacks/08) | n/a here |

## False positives on clean runs (target 0)

${fp.falsePositives} / ${fp.runs} clean runs raised a tamper alert.${fp.falsePositives > 0 ? ` Flagged seqs: ${fp.falsePositiveSeqs.join(", ")}` : ""}

## Silence detection timing

Anchor interval ${ANCHOR_INTERVAL_MS} ms, alert threshold ${(2 * ANCHOR_INTERVAL_MS) / 1000}s (2x interval). ${silencePass}/${silence.length} idle-gap checks matched the expected on/off transition:

| Idle seconds since last anchor | Expected | Got | Pass |
|---|---|---|---|
${silence.map((t) => `| ${t.idleSeconds}s | ${t.expectedTriggered ? "ANCHOR_SILENCE" : "quiet"} | ${t.actualTriggered ? "ANCHOR_SILENCE" : "quiet"} | ${t.pass ? "✓" : "✗"} |`).join("\n")}

## Detection latency detail

Per-attack average and p95 of \`verifyLogs()\`'s own compute time (sub-millisecond; this is the verifier's matching cost, not the end-to-end "tamper to red verdict on the dashboard" time, which also includes however often the dashboard polls \`/api/verify\`):

| Attack | Avg latency | p95 latency |
|---|---|---|
${attackStats.map((s) => `| ${s.name} | ${round(s.latenciesMs.reduce((a, b) => a + b, 0) / s.latenciesMs.length, 3)} ms | ${round(percentile([...s.latenciesMs].sort((a, b) => a - b), 0.95), 3)} ms |`).join("\n")}

## Notes

${resultsJson.notes.map((n) => `- ${n}`).join("\n")}

Raw numbers: \`bench/results/results.json\`. Re-run: \`cd bench && npm run bench\`.
`;

  fs.writeFileSync(path.join(resultsDir, "results.md"), md, "utf-8");
  console.log(`\nWrote ${path.join(resultsDir, "results.json")}`);
  console.log(`Wrote ${path.join(resultsDir, "results.md")}`);
}

main();
