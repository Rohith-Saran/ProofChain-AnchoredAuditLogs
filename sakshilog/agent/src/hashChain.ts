import { createHash } from "node:crypto";
import type { LogEntry } from "./types.ts";
import { GENESIS_PREV_HASH } from "./types.ts";
import { AgentDB } from "./db.ts";
import { CollectorClient } from "./collectorClient.ts";

export function computeEntryHash(entry: {
  seq: number;
  ts: number;
  host: string;
  source: string;
  message: string;
  prevHash: string;
}): string {
  // INTERFACES.md: hash = sha256(seq | ts | host | source | message | prevHash)
  const raw = `${entry.seq}|${entry.ts}|${entry.host}|${entry.source}|${entry.message}|${entry.prevHash}`;
  return createHash("sha256").update(raw).digest("hex");
}

export interface AppendOptions {
  host?: string;
  source: string;
  level?: string;
  message: string;
  ts?: number;
}

export class HashChain {
  private lastSeq: number;
  private lastHash: string;
  private defaultHost: string;
  private readonly db: AgentDB;
  private readonly collector?: CollectorClient;

  constructor(
    db: AgentDB,
    collector?: CollectorClient,
    host = "victim-01"
  ) {
    this.db = db;
    this.collector = collector;
    this.defaultHost = host;
    const latest = this.db.getLatestEntry();
    if (latest) {
      this.lastSeq = latest.seq;
      this.lastHash = latest.hash;
    } else {
      this.lastSeq = 0;
      this.lastHash = GENESIS_PREV_HASH;
    }
  }

  append(opts: AppendOptions): LogEntry {
    const seq = this.lastSeq + 1;
    const ts = opts.ts ?? Date.now();
    const host = opts.host ?? this.defaultHost;
    const source = opts.source;
    const level = opts.level ?? "info";
    const message = opts.message;
    const prevHash = this.lastHash;

    const hash = computeEntryHash({
      seq,
      ts,
      host,
      source,
      message,
      prevHash,
    });

    const entry: LogEntry = {
      seq,
      ts,
      host,
      source,
      level,
      message,
      prevHash,
      hash,
      batchId: null,
    };

    this.db.insert(entry);
    this.lastSeq = seq;
    this.lastHash = hash;

    if (this.collector) {
      this.collector.pushEntry(entry);
    }

    return entry;
  }

  appendBulk(items: AppendOptions[]): LogEntry[] {
    const entries: LogEntry[] = [];
    for (const item of items) {
      const seq = this.lastSeq + 1;
      const ts = item.ts ?? Date.now();
      const host = item.host ?? this.defaultHost;
      const source = item.source;
      const level = item.level ?? "info";
      const message = item.message;
      const prevHash = this.lastHash;

      const hash = computeEntryHash({
        seq,
        ts,
        host,
        source,
        message,
        prevHash,
      });

      const entry: LogEntry = {
        seq,
        ts,
        host,
        source,
        level,
        message,
        prevHash,
        hash,
        batchId: null,
      };

      entries.push(entry);
      this.lastSeq = seq;
      this.lastHash = hash;
    }

    this.db.insertBatch(entries);

    if (this.collector) {
      for (const entry of entries) {
        this.collector.pushEntry(entry);
      }
    }

    return entries;
  }

  getHead(): { seq: number; hash: string } {
    return { seq: this.lastSeq, hash: this.lastHash };
  }
}
