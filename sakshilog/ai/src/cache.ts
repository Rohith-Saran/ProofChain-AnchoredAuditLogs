/**
 * Result cache keyed by the evidence state, so the same evidence never pays for a second
 * LLM call and concurrent requests share one in-flight call. Failures are not cached.
 */
import { createHash } from "node:crypto";
import type { EvidenceContext } from "./verifierClient.ts";

interface Slot<T> {
  value: Promise<T>;
  expiresAt: number;
}

const slots = new Map<string, Slot<unknown>>();

/**
 * Keyed on what the analysis is about: the tampering findings and the silence alert. New
 * verified entries arrive every few seconds under load, so they only refresh the result
 * once the TTL runs out, instead of on every anchor.
 */
export function evidenceKey(feature: string, ctx: EvidenceContext, extra = ""): string {
  const findings = ctx.flaggedEntries
    .filter((f) => f.verdict !== "UNANCHORED_WINDOW")
    .map((f) => `${f.seq}:${f.verdict}`)
    .join(",");
  const raw = JSON.stringify([feature, findings, ctx.silence.triggered, extra]);
  return createHash("sha256").update(raw).digest("hex");
}

export async function cached<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = slots.get(key) as Slot<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;

  const value = compute();
  slots.set(key, { value, expiresAt: now + ttlMs });
  value.catch(() => slots.delete(key));
  return value;
}

export function clearCache(): void {
  slots.clear();
}
