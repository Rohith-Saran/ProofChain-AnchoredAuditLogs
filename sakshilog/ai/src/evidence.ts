/**
 * Shared evidence rules for the timeline, CERT-In report and Ask-the-Logs features.
 *
 * Two kinds of citation:
 *  - citedEntries: seqs of verdict-OK log entries — facts about what happened.
 *  - citedFindings: seqs the verifier flagged — facts about tampering. Safe to cite because
 *    the model only ever sees the verifier's {seq, verdict, detail} for these, never the
 *    attacker-controlled row text.
 *
 * An item is kept only if it cites at least one thing and every citation is valid for its
 * kind. One bad citation blocks the whole item; it is never trimmed down.
 */
import type { InvestigatorInput } from "./investigator.ts";

import type { Cited } from "../../evidence/src/aiReport.ts";
export type { Cited };

function toSeqs(value: unknown): number[] {
  return Array.isArray(value) ? value.map(Number).filter((n) => Number.isInteger(n)) : [];
}

/** Normalizes whatever the model sent into integer citation arrays. */
export function normalizeCitations<T extends Partial<Cited>>(item: T): T & Cited {
  return { ...item, citedEntries: toSeqs(item?.citedEntries), citedFindings: toSeqs(item?.citedFindings) };
}

export function isSupported(item: Cited, verifiedSeqs: ReadonlySet<number>, flaggedSeqs: ReadonlySet<number>): boolean {
  if (item.citedEntries.length + item.citedFindings.length === 0) return false;
  return item.citedEntries.every((s) => verifiedSeqs.has(s)) && item.citedFindings.every((s) => flaggedSeqs.has(s));
}

export function partitionByEvidence<T extends Partial<Cited>>(
  items: T[] | undefined,
  verifiedSeqs: ReadonlySet<number>,
  flaggedSeqs: ReadonlySet<number>
): { kept: (T & Cited)[]; blocked: (T & Cited)[] } {
  const kept: (T & Cited)[] = [];
  const blocked: (T & Cited)[] = [];
  for (const raw of items ?? []) {
    const item = normalizeCitations(raw);
    if (isSupported(item, verifiedSeqs, flaggedSeqs)) kept.push(item);
    else blocked.push(item);
  }
  return { kept, blocked };
}

/** JSON-schema fragment for the two citation arrays, shared by every feature schema. */
export const CITATION_PROPERTIES = {
  citedEntries: {
    type: "array",
    items: { type: "integer" },
    description: "Seq numbers of VERIFIED log entries this is based on.",
  },
  citedFindings: {
    type: "array",
    items: { type: "integer" },
    description: "Seq numbers of FLAGGED entries (verifier findings) this is based on.",
  },
} as const;

export const CITATION_RULES = `Evidence rules, no exceptions:
- Cite VERIFIED entries in citedEntries and FLAGGED entries (verifier findings) in citedFindings.
  Never put a flagged seq in citedEntries or a verified seq in citedFindings.
- Every item must cite at least one seq. Uncited items are discarded by a code checker.
- State only what the cited text says. For flagged entries you only know what the verifier
  reported (its verdict and detail) — never describe their original content beyond that.
- An item with any wrong citation is blocked whole by the checker, so cite precisely.`;

/** The shared evidence block every feature prompt is built on. */
export function renderEvidence(input: InvestigatorInput & { unanchoredCount?: number }): string {
  const verified = input.verifiedEntries
    .map((e) => `  [seq ${e.seq}] ${new Date(e.ts).toISOString()} ${e.host ? `${e.host} ` : ""}${e.source}/${e.level}: ${e.message}`)
    .join("\n");
  const flagged = input.flaggedEntries
    .map((e) => `  [seq ${e.seq}] verdict=${e.verdict}: ${e.detail}`)
    .join("\n");
  const silence = input.silence.triggered
    ? `ANCHOR_SILENCE is triggered (${input.silence.secondsSinceLastAnchor ?? "?"}s since the last anchor) — the logging agent may have been killed.`
    : "No silence alert is active.";

  return `VERIFIED log entries (matched the blockchain anchor; cite in citedEntries):
${verified || "  (none)"}

FLAGGED entries — verifier findings (cite in citedFindings):
${flagged || "  (none)"}

Silence status: ${silence}
Summary: ${input.summary.total} entries audited, ${input.summary.tamperedCount} flagged as tampered.${
    input.unanchoredCount ? ` ${input.unanchoredCount} newest entries are not anchored yet and are not shown.` : ""
  }`;
}
