import { MerkleTree } from "./merkle.ts";
import { AgentDB } from "./db.ts";
import { CollectorClient } from "./collectorClient.ts";
import type { Batch } from "./types.ts";
import * as path from "node:path";
import * as fs from "node:fs";

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
        const mod = await import(anchorClientPath);
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
      if (unanchored.length === 0) {
        // Heartbeat or idle
        return null;
      }

      const startSeq = unanchored[0].seq;
      const endSeq = unanchored[unanchored.length - 1].seq;
      const lastEntry = unanchored[unanchored.length - 1];

      const leafHashes = unanchored.map((e) => e.hash);
      const tree = new MerkleTree(leafHashes);
      const merkleRoot = tree.rootWith0x;
      const lastChainHash = lastEntry.hash.startsWith("0x") ? lastEntry.hash : "0x" + lastEntry.hash;

      let batch: Batch;

      // 1. Try AnchorClient directly if initialized
      if (this.anchorClient) {
        const nextId = await this.anchorClient.nextBatchId();
        const res = await this.anchorClient.anchor({
          batchId: Number(nextId),
          merkleRoot,
          lastChainHash,
          startSeq,
          endSeq,
        });
        batch = {
          batchId: Number(res.batchId),
          startSeq,
          endSeq,
          merkleRoot,
          lastChainHash,
          txHash: res.txHash,
          blockNumber: res.blockNumber,
          timestamp: res.timestamp,
        };
      } else if (this.anchorServiceUrl) {
        // 2. Try HTTP Anchor Service endpoint
        const resp = await fetch(`${this.anchorServiceUrl}/api/anchor`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            merkleRoot,
            lastChainHash,
            startSeq,
            endSeq,
          }),
        });
        if (!resp.ok) {
          throw new Error(`Anchor service HTTP error ${resp.status}`);
        }
        batch = (await resp.json()) as Batch;
      } else {
        // 3. Fallback stand-in batch for testing when chain isn't booted yet
        const currentBatchId = Math.floor(startSeq / 100);
        batch = {
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

      // Mark logs in local DB
      this.db.markAnchored(startSeq, endSeq, batch.batchId);
      this.lastEndSeq = endSeq;
      this.lastChainHash = lastEntry.hash;

      console.log(
        `[AnchorConnector] Anchored batch ${batch.batchId} (seq ${batch.startSeq}..${batch.endSeq}) ` +
        `root: ${batch.merkleRoot.slice(0, 10)}... tx: ${batch.txHash ? batch.txHash.slice(0, 10) + '...' : 'none'}`
      );

      // Notify collector
      if (this.collector) {
        await this.collector.notifyBatch(batch);
      }

      return batch;
    } catch (err) {
      console.error("[AnchorConnector] Anchoring failed:", (err as Error).message);
      return null;
    } finally {
      this.isAnchoring = false;
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
