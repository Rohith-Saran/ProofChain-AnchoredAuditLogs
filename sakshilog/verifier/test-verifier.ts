import { computeEntryHash } from "./src/hash.ts";
import { MerkleTree } from "./src/merkle.ts";
import { verifyLogs, verifyBaseline } from "./src/verifier.ts";
import type { Batch, LogEntry } from "./src/types.ts";
import { GENESIS_PREV_HASH } from "./src/types.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
}

/** Build a clean, self-consistent hash chain of `count` entries, exactly like agent/src/hashChain.ts. */
function buildChain(count: number, startSeq = 1, startTs = 1_700_000_000_000): LogEntry[] {
  const entries: LogEntry[] = [];
  let prevHash = GENESIS_PREV_HASH;
  for (let i = 0; i < count; i++) {
    const seq = startSeq + i;
    const ts = startTs + i * 1000;
    const base = { seq, ts, host: "victim-01", source: "auth", message: `event ${seq}`, prevHash };
    const hash = computeEntryHash(base);
    entries.push({ ...base, level: "info", hash, batchId: null });
    prevHash = hash;
  }
  return entries;
}

/** Group entries into on-chain batches of `batchSize`, computing the same Merkle root the agent would. */
function buildBatches(entries: LogEntry[], batchSize: number, startTs = 1_700_000_100): Batch[] {
  const batches: Batch[] = [];
  for (let i = 0; i < entries.length; i += batchSize) {
    const slice = entries.slice(i, i + batchSize);
    const tree = new MerkleTree(slice.map((e) => e.hash));
    batches.push({
      batchId: batches.length,
      startSeq: slice[0].seq,
      endSeq: slice[slice.length - 1].seq,
      merkleRoot: tree.rootWith0x,
      lastChainHash: "0x" + slice[slice.length - 1].hash,
      txHash: "0x" + "a".repeat(64),
      blockNumber: batches.length + 1,
      timestamp: startTs + batches.length * 5,
    });
  }
  return batches;
}

function clone(entries: LogEntry[]): LogEntry[] {
  return entries.map((e) => ({ ...e }));
}

function verdictFor(result: ReturnType<typeof verifyLogs>, seq: number) {
  const ev = result.entries.find((e) => e.seq === seq);
  assert(!!ev, `expected an entry verdict for seq ${seq}`);
  return ev!;
}

function run() {
  console.log("==================================================================");
  console.log("        SakshiLog M3 Verifier - Unit & Attack-Detection Tests      ");
  console.log("==================================================================");

  // ---------------------------------------------------------------- 1. clean run, no tampering
  console.log("\n[Test 1] Clean run: 40 entries, 2 batches of 20, no tampering");
  {
    const entries = buildChain(40);
    const batches = buildBatches(entries, 20);
    const result = verifyLogs({
      localEntries: clone(entries),
      collectorEntries: clone(entries),
      batches,
      anchorIntervalMs: 5000,
      nowMs: batches[batches.length - 1].timestamp! * 1000 + 1000,
    });
    assert(result.summary.tamperedCount === 0, `expected 0 tampered, got ${result.summary.tamperedCount}`);
    assert(result.summary.byVerdict.OK === 40, `expected 40 OK, got ${result.summary.byVerdict.OK}`);
    assert(result.summary.ok === true, "expected summary.ok === true on a clean run");
    assert(result.silence.triggered === false, "expected no silence alert right after the last anchor");
    console.log("  ✓ All 40 entries verdict OK, no silence alert, summary.ok = true");
  }

  // ---------------------------------------------------------------- 2. attack 1: edit a line
  console.log("\n[Test 2] Attack 1: edit a line (change message) without recomputing hash");
  {
    const entries = buildChain(20);
    const batches = buildBatches(entries, 20);
    const collector = clone(entries);
    const local = clone(entries);
    local[10].message = "attacker changed this message"; // hash/prevHash left stale

    const result = verifyLogs({ localEntries: local, collectorEntries: collector, batches, nowMs: Date.now() });
    const ev = verdictFor(result, local[10].seq);
    assert(ev.verdict === "MODIFIED", `expected MODIFIED, got ${ev.verdict}`);
    console.log(`  ✓ seq ${ev.seq} correctly flagged MODIFIED: ${ev.detail}`);

    const baseline = verifyBaseline(local);
    assert(baseline.ok === false, "plain hash chain should also catch a naive edit (stale hash)");
    console.log("  ✓ Plain hash chain (baseline) also catches the naive edit, as expected");
  }

  // ---------------------------------------------------------------- 3. attack 2: delete a line
  console.log("\n[Test 3] Attack 2: delete a line (the sudo entry)");
  {
    const entries = buildChain(20);
    const batches = buildBatches(entries, 20);
    const collector = clone(entries);
    const deletedSeq = entries[9].seq;
    const local = clone(entries).filter((e) => e.seq !== deletedSeq);

    const result = verifyLogs({ localEntries: local, collectorEntries: collector, batches, nowMs: Date.now() });
    const ev = verdictFor(result, deletedSeq);
    assert(ev.verdict === "DELETED", `expected DELETED, got ${ev.verdict}`);
    console.log(`  ✓ seq ${ev.seq} correctly flagged DELETED: ${ev.detail}`);
  }

  // ---------------------------------------------------------------- 4. attack 3: insert a fake line
  console.log("\n[Test 4] Attack 3: insert a fake line the collector never saw");
  {
    const entries = buildChain(20);
    const batches = buildBatches(entries, 20);
    const collector = clone(entries);
    const local = clone(entries);
    const fake: LogEntry = {
      seq: 100,
      ts: Date.now(),
      host: "victim-01",
      source: "auth",
      level: "info",
      message: "fake injected event",
      prevHash: local[local.length - 1].hash,
      hash: computeEntryHash({
        seq: 100,
        ts: local[local.length - 1].ts,
        host: "victim-01",
        source: "auth",
        message: "fake injected event",
        prevHash: local[local.length - 1].hash,
      }),
      batchId: null,
    };
    local.push(fake);

    const result = verifyLogs({ localEntries: local, collectorEntries: collector, batches, nowMs: Date.now() });
    const ev = verdictFor(result, 100);
    assert(ev.verdict === "INSERTED", `expected INSERTED, got ${ev.verdict}`);
    console.log(`  ✓ seq ${ev.seq} correctly flagged INSERTED: ${ev.detail}`);
  }

  // ---------------------------------------------------------------- 5. attack 4: reorder lines
  console.log("\n[Test 5] Attack 4: reorder (swap content between two seqs)");
  {
    const entries = buildChain(20);
    const batches = buildBatches(entries, 20);
    const collector = clone(entries);
    const local = clone(entries);
    const i = 5;
    const j = 12;
    const tmp = { message: local[i].message, hash: local[i].hash, prevHash: local[i].prevHash, ts: local[i].ts };
    local[i] = { ...local[i], message: local[j].message, hash: local[j].hash, prevHash: local[j].prevHash, ts: local[j].ts };
    local[j] = { ...local[j], message: tmp.message, hash: tmp.hash, prevHash: tmp.prevHash, ts: tmp.ts };

    const result = verifyLogs({ localEntries: local, collectorEntries: collector, batches, nowMs: Date.now() });
    const evI = verdictFor(result, local[i].seq);
    const evJ = verdictFor(result, local[j].seq);
    assert(evI.verdict === "REORDERED", `expected REORDERED at seq ${local[i].seq}, got ${evI.verdict}`);
    assert(evJ.verdict === "REORDERED", `expected REORDERED at seq ${local[j].seq}, got ${evJ.verdict}`);
    console.log(`  ✓ seq ${evI.seq} <-> seq ${evJ.seq} both correctly flagged REORDERED`);
  }

  // ---------------------------------------------------------------- 6. attack 5: truncate the tail
  console.log("\n[Test 6] Attack 5: truncate the tail (delete the last N rows)");
  {
    const entries = buildChain(20);
    const batches = buildBatches(entries, 20);
    const collector = clone(entries);
    const local = clone(entries).slice(0, 15); // drop seq 16..20

    const result = verifyLogs({ localEntries: local, collectorEntries: collector, batches, nowMs: Date.now() });
    for (let seq = 16; seq <= 20; seq++) {
      const ev = verdictFor(result, seq);
      assert(ev.verdict === "TRUNCATED", `expected TRUNCATED at seq ${seq}, got ${ev.verdict}`);
    }
    console.log("  ✓ seq 16..20 all correctly flagged TRUNCATED");

    const baseline = verifyBaseline(local);
    assert(baseline.ok === true, "a plain hash chain has nothing left to contradict a tail truncation (Missed)");
    console.log("  ✓ Plain hash chain (baseline) misses the truncation, as expected (nothing left to contradict)");
  }

  // ---------------------------------------------------------------- 7. attack 6: delete + recompute downstream hashes
  console.log("\n[Test 7] Attack 6 (the headline attack): delete a line and recompute every hash after it");
  {
    const entries = buildChain(20);
    const batches = buildBatches(entries, 20);
    const collector = clone(entries);

    // Sophisticated attacker: remove seq 8, then re-chain every entry after it so the
    // *local* hash chain is perfectly self-consistent.
    const victimIdx = entries.findIndex((e) => e.seq === 8);
    const rebuilt = entries.filter((_, idx) => idx !== victimIdx).map((e) => ({ ...e }));
    let prevHash = rebuilt[victimIdx - 1].hash;
    for (let idx = victimIdx; idx < rebuilt.length; idx++) {
      const e = rebuilt[idx];
      e.prevHash = prevHash;
      e.hash = computeEntryHash(e);
      prevHash = e.hash;
    }

    const baseline = verifyBaseline(rebuilt);
    assert(baseline.ok === true, "a plain hash chain is fooled: it looks perfectly self-consistent (Missed)");
    console.log("  ✓ Plain hash chain (baseline) says 'all good' - exactly the failure mode we demo");

    const result = verifyLogs({ localEntries: rebuilt, collectorEntries: collector, batches, nowMs: Date.now() });
    const deletedEv = verdictFor(result, 8);
    assert(deletedEv.verdict === "DELETED", `expected seq 8 DELETED, got ${deletedEv.verdict}`);

    const batchVerdict = result.batches.find((b) => b.batchId === 0)!;
    assert(batchVerdict.rootMatches === false, "the re-chained batch must NOT match its anchored Merkle root");
    assert(result.summary.tamperedCount > 0, "SakshiLog must catch attack 6 even though the local chain self-validates");
    console.log(`  ✓ SakshiLog catches it anyway: batch 0 root mismatch (on-chain=${batchVerdict.onChainMerkleRoot.slice(0, 12)}... local=${batchVerdict.localMerkleRoot.slice(0, 12)}...), seq 8 flagged DELETED`);
  }

  // ---------------------------------------------------------------- 8. attack 7: silence detection
  console.log("\n[Test 8] Attack 7: kill the agent -> silence detection");
  {
    const entries = buildChain(20);
    const batches = buildBatches(entries, 20, 1_700_000_000); // last anchor at t=1_700_000_100 (2 batches * 5s apart)
    const lastAnchorTs = batches[batches.length - 1].timestamp!;

    const soonAfter = verifyLogs({
      localEntries: clone(entries),
      collectorEntries: clone(entries),
      batches,
      anchorIntervalMs: 5000,
      nowMs: (lastAnchorTs + 3) * 1000, // 3s later, well under the 10s threshold
    });
    assert(soonAfter.silence.triggered === false, "should not alert 3s after the last anchor (threshold is 10s)");

    const longAfter = verifyLogs({
      localEntries: clone(entries),
      collectorEntries: clone(entries),
      batches,
      anchorIntervalMs: 5000,
      nowMs: (lastAnchorTs + 60) * 1000, // agent killed: 60s of silence
    });
    assert(longAfter.silence.triggered === true, "should raise ANCHOR_SILENCE after 60s with a 5s interval");
    console.log(`  ✓ Silence alert correctly off at +3s and ON at +60s (threshold ${longAfter.silence.thresholdSeconds}s)`);

    const baselineMode = verifyLogs({
      localEntries: clone(entries),
      collectorEntries: clone(entries),
      batches,
      anchorIntervalMs: 5000,
      nowMs: (lastAnchorTs + 60) * 1000,
      baselineMode: true,
    });
    assert(baselineMode.silence.triggered === false, "baseline mode intentionally suspends anchoring: no silence alert");
    console.log("  ✓ Baseline mode correctly suppresses the silence alert (anchoring is intentionally off)");
  }

  // ---------------------------------------------------------------- 9. heartbeats and unanchored tail
  console.log("\n[Test 9] Heartbeat batches and an unanchored tail are handled correctly");
  {
    const entries = buildChain(25); // 20 anchored + 5 unanchored tail
    const batches = buildBatches(entries.slice(0, 20), 20);
    batches.push({
      batchId: 1,
      startSeq: 21,
      endSeq: 20,
      merkleRoot: "0x" + "0".repeat(64),
      lastChainHash: batches[0].lastChainHash,
      txHash: "0x" + "b".repeat(64),
      blockNumber: 2,
      timestamp: batches[0].timestamp! + 5,
    });

    const result = verifyLogs({ localEntries: clone(entries), collectorEntries: clone(entries), batches, nowMs: Date.now() });
    const hb = result.batches.find((b) => b.isHeartbeat)!;
    assert(hb.rootMatches === true, "a heartbeat trivially matches (empty range)");
    for (let seq = 21; seq <= 25; seq++) {
      const ev = verdictFor(result, seq);
      assert(ev.verdict === "UNANCHORED_WINDOW", `expected UNANCHORED_WINDOW at seq ${seq}, got ${ev.verdict}`);
    }
    console.log("  ✓ Heartbeat batch verified, seq 21..25 correctly flagged UNANCHORED_WINDOW");
  }

  console.log("\n==================================================================");
  console.log("  ALL VERIFIER TESTS PASSED");
  console.log("==================================================================");
}

run();
