import { createHash } from "node:crypto";

/** INTERFACES.md: hash = sha256(seq | ts | host | source | message | prevHash) */
export function computeEntryHash(e: {
  seq: number;
  ts: number;
  host: string;
  source: string;
  message: string;
  prevHash: string;
}): string {
  const raw = `${e.seq}|${e.ts}|${e.host}|${e.source}|${e.message}|${e.prevHash}`;
  return createHash("sha256").update(raw).digest("hex");
}
