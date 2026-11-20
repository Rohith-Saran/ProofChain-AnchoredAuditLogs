/**
 * Builds a disposable, in-memory "clean" scenario (a hash chain + the on-chain batches
 * an honest anchor service would have produced for it) so the benchmark can run
 * hundreds of attack trials fast, with no live chain or SQLite file required.
 */
import { computeEntryHash } from "../../verifier/src/hash.ts";
import { MerkleTree } from "../../verifier/src/merkle.ts";
import type { Batch, LogEntry } from "../../verifier/src/types.ts";
import { GENESIS_PREV_HASH } from "../../verifier/src/types.ts";

const SOURCES: Array<{ source: string; level: string; message: () => string }> = [
  { source: "auth", level: "info", message: () => `Accepted publickey for admin from 192.168.1.${rnd(2, 254)} port ${rnd(1024, 65535)} ssh2` },
  { source: "sudo", level: "notice", message: () => `admin : TTY=pts/1 ; PWD=/home ; USER=root ; COMMAND=/usr/bin/apt-get update` },
  { source: "auditd", level: "info", message: () => `type=SYSCALL arch=c000003e syscall=2 success=yes path="/etc/shadow"` },
  { source: "kernel", level: "notice", message: () => `iptables: ACCEPT IN=eth0 SRC=10.0.0.${rnd(2, 254)} DST=10.0.0.1 PROTO=TCP DPT=${rnd(1024, 65535)}` },
];

function rnd(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export interface Scenario {
  entries: LogEntry[];
  batches: Batch[];
  batchSize: number;
}

/** A clean hash chain of `count` entries, exactly like agent/src/hashChain.ts produces. */
export function buildChain(count: number, startSeq = 1, startTs = 1_700_000_000_000): LogEntry[] {
  const entries: LogEntry[] = [];
  let prevHash = GENESIS_PREV_HASH;
  for (let i = 0; i < count; i++) {
    const seq = startSeq + i;
    const ts = startTs + i * 1000;
    const tpl = SOURCES[rnd(0, SOURCES.length - 1)];
    const base = { seq, ts, host: "victim-01", source: tpl.source, message: tpl.message(), prevHash };
    const hash = computeEntryHash(base);
    entries.push({ ...base, level: tpl.level, hash, batchId: null });
    prevHash = hash;
  }
  return entries;
}

/** Group entries into on-chain batches of `batchSize`, mirroring agent/src/anchorServiceConnector.ts. */
export function buildBatches(entries: LogEntry[], batchSize: number, startTs = 1_700_000_100): Batch[] {
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

export function buildScenario(count = 200, batchSize = 50): Scenario {
  const entries = buildChain(count);
  const batches = buildBatches(entries, batchSize);
  return { entries, batches, batchSize };
}

export function clone(entries: LogEntry[]): LogEntry[] {
  return entries.map((e) => ({ ...e }));
}

export { computeEntryHash, MerkleTree };
