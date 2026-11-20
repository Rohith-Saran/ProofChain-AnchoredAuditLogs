/**
 * Exposure-window comparison (Phase 4b, M1): fixed 5s anchor interval vs risk-driven
 * adaptive anchoring, on the same simulated timeline (quiet traffic, then a brute-force
 * login burst + a new sudo-group member, then the attacker deletes the still-unanchored
 * lines). Reports how many lines were exposed at that moment under each policy, plus the
 * gas cost of the extra anchors adaptive anchoring fires to buy that reduction.
 *
 * Runs the REAL RiskScorer (agent/src/riskScorer.ts) against a virtual clock, not a
 * reimplementation of its scoring rules — the only new code here is the discrete-event
 * scheduler that stands in for anchorServiceConnector.ts's setTimeout loop, built to the
 * same reschedule-on-rising-risk rule (see RESCHEDULE_EPSILON_MS) so it fires anchors at
 * exactly the times the live agent would.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { RiskScorer, RESCHEDULE_EPSILON_MS } from "../../agent/src/riskScorer.ts";
import type { LogEntry } from "../../agent/src/types.ts";

const MAX_INTERVAL_MS = 5000; // quiet-era anchor interval (matches agent default)
const MIN_INTERVAL_MS = 1000; // saturated-risk anchor interval (matches agent default)

// Measured via Hardhat's gas reporter against a local deployment (see implementation/
// PROGRESS.md, M1 log): a batch anchor covering new entries costs ~100,000 gas; a
// heartbeat anchor (empty range, no new entries since the last anchor) costs ~79,000 gas.
const GAS_PER_BATCH_ANCHOR = 100_000;
const GAS_PER_HEARTBEAT_ANCHOR = 79_000;
const GAS_PRICE_GWEI = 1; // local Hardhat node's default gas price; for an illustrative ETH cost only

interface SimLogEvent {
  ts: number;
  message: string;
}

/** A realistic 70s timeline: quiet background traffic, then at T=20s a brute-force login
 *  burst (6 failed attempts in 2.5s) followed by a new sudo-group member at T=23s, then
 *  the attacker strikes at T=23.5s — before either schedule's next quiet-era anchor would
 *  have fired. Traffic continues afterward so both schedules' full-run gas cost is comparable. */
function buildTimeline(): { events: SimLogEvent[]; attackAtMs: number; horizonMs: number } {
  const events: SimLogEvent[] = [];

  // Quiet background: one normal log every 2s from T=0 to T=20s.
  for (let t = 0; t <= 20_000; t += 2000) {
    events.push({ ts: t, message: `Accepted publickey for admin from 192.168.1.15 port 51000 ssh2` });
  }

  // Brute-force burst: 6 failed logins, 500ms apart, starting at T=20s.
  for (let i = 0; i < 6; i++) {
    events.push({ ts: 20_000 + i * 500, message: `Failed password for invalid user hacker from 203.0.113.19 port 51234 ssh2` });
  }

  // New sudo-group member at T=23s (the attacker escalating).
  events.push({ ts: 23_000, message: `add 'hacker' to group 'sudo'` });

  // The attack lands at T=23.5s: the attacker deletes everything written but not yet anchored.
  const attackAtMs = 23_500;

  // Background traffic resumes afterward so the full-run anchor/gas count is comparable.
  for (let t = 25_000; t <= 60_000; t += 2000) {
    events.push({ ts: t, message: `Accepted publickey for admin from 192.168.1.15 port 51000 ssh2` });
  }

  events.sort((a, b) => a.ts - b.ts);
  return { events, attackAtMs, horizonMs: 60_000 };
}

function toLogEntry(ev: SimLogEvent, seq: number): LogEntry {
  return {
    seq,
    ts: ev.ts,
    host: "victim-01",
    source: "auth",
    level: "warning",
    message: ev.message,
    prevHash: "0".repeat(64),
    hash: "0".repeat(64),
    batchId: null,
  };
}

interface AnchorFiring {
  atMs: number;
  entryCount: number; // entries covered since the previous anchor (0 = heartbeat)
}

/** Fixed-cadence schedule: an anchor every MAX_INTERVAL_MS from T=0, independent of load. */
function simulateFixed(events: SimLogEvent[], horizonMs: number): AnchorFiring[] {
  const anchors: AnchorFiring[] = [];
  let lastAnchorAt = 0;
  for (let t = MAX_INTERVAL_MS; t <= horizonMs; t += MAX_INTERVAL_MS) {
    const entryCount = events.filter((e) => e.ts > lastAnchorAt && e.ts <= t).length;
    anchors.push({ atMs: t, entryCount });
    lastAnchorAt = t;
  }
  return anchors;
}

/**
 * Risk-driven schedule: a discrete-event replica of anchorServiceConnector.ts's real
 * scheduling loop (scheduleNext() / observeEntries()) run against a virtual clock instead
 * of real timers, against the SAME RiskScorer used live. Anchor firing and "did risk just
 * rise enough to cut the current wait short" both follow the production rule exactly.
 */
function simulateAdaptive(events: SimLogEvent[], horizonMs: number): AnchorFiring[] {
  const scorer = new RiskScorer({ maxIntervalMs: MAX_INTERVAL_MS, minIntervalMs: MIN_INTERVAL_MS });
  const anchors: AnchorFiring[] = [];

  let clock = 0;
  let lastAnchorAt = 0;
  let nextAnchorAt = clock + scorer.recompute(clock).anchorIntervalMs;
  let idx = 0;
  let seq = 0;

  while (clock < horizonMs) {
    const nextLogTs = idx < events.length ? events[idx].ts : Infinity;

    if (nextLogTs <= nextAnchorAt && nextLogTs <= horizonMs) {
      clock = nextLogTs;
      const entry = toLogEntry(events[idx], ++seq);
      idx++;
      const state = scorer.observe([entry], clock);

      // Mirror AnchorConnector.observeEntries(): cut the current wait short if the fresh
      // risk-driven interval is now meaningfully shorter than the time left on it.
      const remaining = nextAnchorAt - clock;
      if (state.anchorIntervalMs < remaining - RESCHEDULE_EPSILON_MS) {
        nextAnchorAt = clock + state.anchorIntervalMs;
      }
    } else {
      clock = nextAnchorAt;
      const entryCount = events.filter((e) => e.ts > lastAnchorAt && e.ts <= clock).length;
      anchors.push({ atMs: clock, entryCount });
      lastAnchorAt = clock;
      const state = scorer.recompute(clock);
      nextAnchorAt = clock + state.anchorIntervalMs;
    }
  }

  return anchors;
}

function exposureAtAttack(anchors: AnchorFiring[], events: SimLogEvent[], attackAtMs: number): { lastAnchorAtMs: number; windowMs: number; linesExposed: number } {
  const priorAnchors = anchors.filter((a) => a.atMs <= attackAtMs);
  const lastAnchorAtMs = priorAnchors.length > 0 ? priorAnchors[priorAnchors.length - 1].atMs : 0;
  const linesExposed = events.filter((e) => e.ts > lastAnchorAtMs && e.ts <= attackAtMs).length;
  return { lastAnchorAtMs, windowMs: attackAtMs - lastAnchorAtMs, linesExposed };
}

function gasCost(anchors: AnchorFiring[]): { anchorCount: number; heartbeats: number; totalGas: number } {
  let totalGas = 0;
  let heartbeats = 0;
  for (const a of anchors) {
    if (a.entryCount > 0) {
      totalGas += GAS_PER_BATCH_ANCHOR;
    } else {
      totalGas += GAS_PER_HEARTBEAT_ANCHOR;
      heartbeats++;
    }
  }
  return { anchorCount: anchors.length, heartbeats, totalGas };
}

function main() {
  console.log("==================================================================");
  console.log("  SakshiLog Exposure Window: fixed 5s interval vs adaptive anchoring");
  console.log("==================================================================");

  const { events, attackAtMs, horizonMs } = buildTimeline();

  const fixedAnchors = simulateFixed(events, horizonMs);
  const adaptiveAnchors = simulateAdaptive(events, horizonMs);

  const fixedExposure = exposureAtAttack(fixedAnchors, events, attackAtMs);
  const adaptiveExposure = exposureAtAttack(adaptiveAnchors, events, attackAtMs);

  const fixedGas = gasCost(fixedAnchors);
  const adaptiveGas = gasCost(adaptiveAnchors);
  const extraAnchors = adaptiveGas.anchorCount - fixedGas.anchorCount;
  const extraGas = adaptiveGas.totalGas - fixedGas.totalGas;
  // Illustrative only (local Hardhat gas price): not a claim about mainnet/L2 cost.
  const extraGasCostEth = (extraGas * GAS_PRICE_GWEI) / 1e9;

  console.log(`  Attack lands at T=${(attackAtMs / 1000).toFixed(1)}s, after a 6-attempt login burst starting T=20s.`);
  console.log(`  Fixed 5s:    last anchor at T=${(fixedExposure.lastAnchorAtMs / 1000).toFixed(1)}s, exposure window ${fixedExposure.windowMs} ms, ${fixedExposure.linesExposed} lines exposed`);
  console.log(`  Adaptive:    last anchor at T=${(adaptiveExposure.lastAnchorAtMs / 1000).toFixed(1)}s, exposure window ${adaptiveExposure.windowMs} ms, ${adaptiveExposure.linesExposed} lines exposed`);
  console.log(`  Reduction:   ${fixedExposure.linesExposed - adaptiveExposure.linesExposed} fewer lines exposed, ${fixedExposure.windowMs - adaptiveExposure.windowMs} ms shorter window`);
  console.log(`  Anchors over ${horizonMs / 1000}s run: fixed ${fixedGas.anchorCount}, adaptive ${adaptiveGas.anchorCount} (+${extraAnchors})`);
  console.log(`  Gas over the run: fixed ${fixedGas.totalGas.toLocaleString("en-US")}, adaptive ${adaptiveGas.totalGas.toLocaleString("en-US")} (+${extraGas.toLocaleString("en-US")})`);

  const generatedAt = new Date().toISOString();
  const resultsJson = {
    generatedAt,
    config: {
      maxIntervalMs: MAX_INTERVAL_MS,
      minIntervalMs: MIN_INTERVAL_MS,
      horizonMs,
      attackAtMs,
      gasPerBatchAnchor: GAS_PER_BATCH_ANCHOR,
      gasPerHeartbeatAnchor: GAS_PER_HEARTBEAT_ANCHOR,
    },
    fixed: { ...fixedExposure, ...fixedGas },
    adaptive: { ...adaptiveExposure, ...adaptiveGas },
    delta: {
      linesExposedReduced: fixedExposure.linesExposed - adaptiveExposure.linesExposed,
      windowMsReduced: fixedExposure.windowMs - adaptiveExposure.windowMs,
      extraAnchors,
      extraGas,
      extraGasCostEthAtLocalGasPrice: extraGasCostEth,
    },
    notes: [
      "Simulated timeline, not a live-chain measurement: the RiskScorer and the reschedule rule are the real agent/src/riskScorer.ts and anchorServiceConnector.ts logic, run against a virtual clock so the comparison is deterministic and instant. Gas figures are the Phase 1 Hardhat gas-reporter numbers (see implementation/PROGRESS.md, M1 log), not re-measured on-chain here.",
      "Both schedules share the same event timeline, so the comparison isolates the scheduling policy — nothing about log volume or attack timing differs between them.",
    ],
  };

  const resultsDir = path.resolve(import.meta.dirname, "../results");
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(path.join(resultsDir, "exposure-window.json"), JSON.stringify(resultsJson, null, 2), "utf-8");

  const md = `# Exposure window: fixed vs adaptive anchoring

Generated ${generatedAt}. Simulated timeline: quiet traffic from T=0s, a 6-attempt brute-force
login burst starting T=20s, a new sudo-group member at T=23s, and the attacker deleting every
still-unanchored line at T=${(attackAtMs / 1000).toFixed(1)}s. Both schedules run the real
\`RiskScorer\` (\`agent/src/riskScorer.ts\`) against the identical event timeline.

## Exposure at the moment of attack

| Policy | Last anchor before attack | Exposure window | Lines exposed |
|---|---|---|---|
| Fixed ${MAX_INTERVAL_MS / 1000}s interval | T=${(fixedExposure.lastAnchorAtMs / 1000).toFixed(1)}s | ${fixedExposure.windowMs} ms | ${fixedExposure.linesExposed} |
| Adaptive (${MIN_INTERVAL_MS / 1000}s–${MAX_INTERVAL_MS / 1000}s, risk-driven) | T=${(adaptiveExposure.lastAnchorAtMs / 1000).toFixed(1)}s | ${adaptiveExposure.windowMs} ms | ${adaptiveExposure.linesExposed} |

Adaptive anchoring reduced the exposure window by **${fixedExposure.windowMs - adaptiveExposure.windowMs} ms** and cut the lines
exposed to the attacker from ${fixedExposure.linesExposed} to ${adaptiveExposure.linesExposed} (**${fixedExposure.linesExposed - adaptiveExposure.linesExposed} fewer**) by reacting
to the login burst instead of waiting out a fixed interval.

## Gas cost of the extra anchors

| Policy | Anchors over ${horizonMs / 1000}s | Heartbeats | Total gas |
|---|---|---|---|
| Fixed ${MAX_INTERVAL_MS / 1000}s interval | ${fixedGas.anchorCount} | ${fixedGas.heartbeats} | ${fixedGas.totalGas.toLocaleString("en-US")} |
| Adaptive | ${adaptiveGas.anchorCount} | ${adaptiveGas.heartbeats} | ${adaptiveGas.totalGas.toLocaleString("en-US")} |

Adaptive anchoring fired **${extraAnchors} extra anchor${extraAnchors === 1 ? "" : "s"}** over the ${horizonMs / 1000}s run to buy
that reduction, costing **${extraGas.toLocaleString("en-US")} extra gas** (using the Phase 1 measured ~${GAS_PER_BATCH_ANCHOR.toLocaleString("en-US")} gas/batch-anchor and
~${GAS_PER_HEARTBEAT_ANCHOR.toLocaleString("en-US")} gas/heartbeat from \`implementation/PROGRESS.md\`, M1 log).

## Notes

${resultsJson.notes.map((n) => `- ${n}`).join("\n")}

Raw numbers: \`bench/results/exposure-window.json\`. Re-run: \`cd bench && npm run bench:exposure\`.
`;

  fs.writeFileSync(path.join(resultsDir, "exposure-window.md"), md, "utf-8");
  console.log(`\nWrote ${path.join(resultsDir, "exposure-window.json")}`);
  console.log(`Wrote ${path.join(resultsDir, "exposure-window.md")}`);
}

main();
