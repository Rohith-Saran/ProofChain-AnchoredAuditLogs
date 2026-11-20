import { MerkleTree } from "./merkle.ts";
import { AgentDB } from "./db.ts";
import { CollectorClient } from "./collectorClient.ts";
import type { Batch } from "./types.ts";
import * as path from "node:path";
import * as fs from "node:fs";
import { pathToFileURL } from "node:url";

export interface AnchorConfig {
  intervalMs?: number;
  baselineMode?: boolean;
  anchorServiceUrl?: string; // Optional HTTP anchor service endpoint
}

export class AnchorConnector {
  private timer: NodeJS.Timeout | null = null;
  private isAnchoring = false;
  private baselineMode = false;
  private readonly intervalMs: number;
  private anchorClient: any = null;
  private anchorServiceUrl: string | null = null;
  private lastEndSeq = 0;
  private lastChainHash = "0".repeat(64);
  private readonly db: AgentDB;
  private readonly collector?: CollectorClient;
  /** Set by server.ts to push each anchored batch out over Socket.IO ("batch" event). */
  onBatch: ((batch: Batch) => void) | null = null;

  constructor(
    db: AgentDB,
    collector?: CollectorClient,
    cfg?: AnchorConfig
  ) {
    this.db = db;
    this.collector = collector;
    this.intervalMs = cfg?.intervalMs ?? 5000;
    this.baselineMode = cfg?.baselineMode ?? (process.env.BASELINE_MODE === "true");
    this.anchorServiceUrl = cfg?.anchorServiceUrl ?? process.env.ANCHOR_SERVICE_URL ?? null;

    // Initialize last known anchored state
    const latest = this.db.getLatestEntry();
    if (latest) {
      this.lastEndSeq = latest.seq;
      this.lastChainHash = latest.hash;
    }
  }

  setBaselineMode(enabled: boolean): void {
    this.baselineMode = enabled;
    console.log(`[AnchorConnector] Baseline mode is now: ${enabled ? "ON (anchoring suspended)" : "OFF (anchoring active)"}`);
  }

  isBaseline(): boolean {
    return this.baselineMode;
  }

  async start(): Promise<void> {
    await this.initClient();
    this.timer = setInterval(() => {
      this.triggerBatch().catch((err) => {
        console.error("[AnchorConnector] Batch interval error:", err.message);
      });
    }, this.intervalMs);
    console.log(`[AnchorConnector] Started batch interval (${this.intervalMs} ms)`);
  }

  private async initClient(): Promise<void> {
    try {
      // Try loading local anchorClient from anchor-service if contracts deployed
      const anchorClientPath = path.resolve(import.meta.dirname, "../../anchor-service/src/anchorClient.ts");
      if (fs.existsSync(anchorClientPath)) {
        // pathToFileURL: a bare Windows absolute path ("C:\...") isn't a valid specifier
        // for the ESM loader, which requires a file:// URL for absolute paths there.
        const mod = await import(pathToFileURL(anchorClientPath).href);
        if (mod && mod.AnchorClient) {
          try {
            this.anchorClient = mod.AnchorClient.fromEnv();
            console.log(`[AnchorConnector] Initialized AnchorClient at ${this.anchorClient.address}`);
          } catch (e) {
            console.warn(`[AnchorConnector] AnchorClient deployment not ready yet: ${(e as Error).message}`);
          }
        }
      }
    } catch (err) {
      console.warn("[AnchorConnector] Could not load AnchorClient locally:", (err as Error).message);
    }
  }

  async triggerBatch(): Promise<Batch | null> {
    if (this.isAnchoring) return null;
    if (this.baselineMode) {
      // In baseline mode, logs are chained in SQLite, but never anchored to the blockchain.
      // This is used for demonstrating that a plain hash chain attack evades detection.
      return null;
    }

    this.isAnchoring = true;
    try {
      const unanchored = this.db.getUnanchoredEntries(1000);

      let batch: Batch;
      let markStart = 0;
      let markEnd = -1; // markEnd < markStart => nothing to mark anchored locally (heartbeat)

      if (unanchored.length === 0) {
        // Heartbeat: no new logs this interval. Anchor an empty range so a dead agent
        // (no heartbeats arriving at all) is distinguishable from a quiet one.
        const startSeq = this.lastEndSeq + 1;
        const endSeq = this.lastEndSeq;
        const merkleRoot = "0x" + "0".repeat(64);
        const lastChainHash = this.lastChainHash.startsWith("0x") ? this.lastChainHash : "0x" + this.lastChainHash;
        batch = await this.submitAnchor(startSeq, endSeq, merkleRoot, lastChainHash);
      } else {
        const startSeq = unanchored[0].seq;
        const endSeq = unanchored[unanchored.length - 1].seq;
        const lastEntry = unanchored[unanchored.length - 1];

        const leafHashes = unanchored.map((e) => e.hash);
        const tree = new MerkleTree(leafHashes);
        const merkleRoot = tree.rootWith0x;
        const lastChainHash = lastEntry.hash.startsWith("0x") ? lastEntry.hash : "0x" + lastEntry.hash;

        batch = await this.submitAnchor(startSeq, endSeq, merkleRoot, lastChainHash);
        markStart = startSeq;
        markEnd = endSeq;
        this.lastChainHash = lastEntry.hash;
      }

      this.lastEndSeq = batch.endSeq;
      if (markEnd >= markStart) {
        this.db.markAnchored(markStart, markEnd, batch.batchId);
      }

      console.log(
        `[AnchorConnector] Anchored batch ${batch.batchId} (seq ${batch.startSeq}..${batch.endSeq}) ` +
        `root: ${batch.merkleRoot.slice(0, 10)}... tx: ${batch.txHash ? batch.txHash.slice(0, 10) + '...' : 'none'}`
      );

      // Notify collector
      if (this.collector) {
        await this.collector.notifyBatch(batch);
      }
      this.onBatch?.(batch);

      return batch;
    } catch (err) {
      console.error("[AnchorConnector] Anchoring failed:", (err as Error).message);
      return null;
    } finally {
      this.isAnchoring = false;
    }
  }

  /**
   * Submit one anchor (normal range or heartbeat) via whichever backend is available.
   * Prefers the dedicated anchor-service (ANCHOR_SERVICE_URL) when configured — it owns
   * the retry/queue logic and is what pushes live updates to the dashboard over
   * Socket.IO — but falls back to the in-process AnchorClient if the service is
   * unreachable, so a demo doesn't stall just because that one process isn't up.
   */
  private async submitAnchor(startSeq: number, endSeq: number, merkleRoot: string, lastChainHash: string): Promise<Batch> {
    // 1. Try the HTTP anchor service first, if configured
    if (this.anchorServiceUrl) {
      try {
        const resp = await fetch(`${this.anchorServiceUrl}/api/anchor`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ merkleRoot, lastChainHash, startSeq, endSeq }),
        });
        if (!resp.ok) throw new Error(`Anchor service HTTP error ${resp.status}: ${await resp.text()}`);
        return (await resp.json()) as Batch;
      } catch (err) {
        console.warn(`[AnchorConnector] Anchor service unreachable (${(err as Error).message}), falling back`);
      }
    }

    // 2. Direct AnchorClient (in-process)
    if (this.anchorClient) {
      const nextId = await this.anchorClient.nextBatchId();
      const res = await this.anchorClient.anchor({
        batchId: Number(nextId),
        merkleRoot,
        lastChainHash,
        startSeq,
        endSeq,
      });
      return {
        batchId: Number(res.batchId),
        startSeq,
        endSeq,
        merkleRoot,
        lastChainHash,
        txHash: res.txHash,
        blockNumber: res.blockNumber,
        timestamp: res.timestamp,
      };
    }

    // 3. Fallback stand-in batch for testing when chain isn't booted yet
    const currentBatchId = Math.floor(startSeq / 100);
    return {
      batchId: currentBatchId,
      startSeq,
      endSeq,
      merkleRoot,
      lastChainHash,
      txHash: "0x" + "a".repeat(64),
      blockNumber: 1,
      timestamp: Math.floor(Date.now() / 1000),
    };
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
