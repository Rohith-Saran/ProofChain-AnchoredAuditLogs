import type { LogEntry, Batch } from "./types.ts";

export class CollectorClient {
  private queue: LogEntry[] = [];
  private flushing = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly baseUrl: string;

  constructor(collectorUrl?: string) {
    this.baseUrl = collectorUrl ?? process.env.COLLECTOR_URL ?? "http://127.0.0.1:4002";
    this.flushTimer = setInterval(() => this.flush(), 200);
  }

  pushEntry(entry: LogEntry): void {
    this.queue.push(entry);
    if (this.queue.length >= 100) {
      setImmediate(() => this.flush());
    }
  }

  async notifyBatch(batch: Batch): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/api/collector/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      });
    } catch (err) {
      console.warn(`[CollectorClient] Warning: Failed to notify collector of batch ${batch.batchId}:`, (err as Error).message);
    }
  }

  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;

    const batch = this.queue.splice(0, 500);
    try {
      const res = await fetch(`${this.baseUrl}/api/collector/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        console.warn(`[CollectorClient] Ingest response status: ${res.status}`);
      }
    } catch (err) {
      // Off-host push error: keep queue or log warning (don't halt agent)
      console.warn(`[CollectorClient] Ingest dispatch failed (${batch.length} logs):`, (err as Error).message);
    } finally {
      this.flushing = false;
    }
  }

  close(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flush().catch(() => {});
  }
}
