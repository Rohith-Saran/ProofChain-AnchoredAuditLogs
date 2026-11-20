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

export function normalizeHex(h: string | null | undefined): string {
  if (!h) return "";
  const raw = h.startsWith("0x") || h.startsWith("0X") ? h.slice(2) : h;
  return raw.toLowerCase();
}

export function hexEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeHex(a) === normalizeHex(b);
}
