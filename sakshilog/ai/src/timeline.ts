/**
 * Attack timeline: the model proposes the attacker's steps and a MITRE ATT&CK technique for
 * each; code keeps only steps whose citations hold up, rejects technique IDs not on the
 * allowlist, and derives each step's time from the cited entries — the model never
 * supplies a timestamp.
 */
import { CITATION_PROPERTIES, CITATION_RULES, partitionByEvidence, renderEvidence, type Cited } from "./evidence.ts";
import { lookupTechnique, MITRE_TECHNIQUES, TECHNIQUE_IDS } from "./mitre.ts";
import type { EvidenceContext } from "./verifierClient.ts";
import type { AttackTimeline, TimelineStep } from "../../evidence/src/aiReport.ts";
export type { AttackTimeline, TimelineStep };

export interface RawTimelineStep extends Partial<Cited> {
  title?: string;
  description?: string;
  techniqueId?: string;
}

export const TIMELINE_SYSTEM = `You are SakshiLog's incident responder. From a tamper-evident log audit, reconstruct the
attacker's actions as an ordered attack timeline (earliest first), 2 to 8 steps.
For each step give a short title, one factual sentence of description, and the single
best-fitting MITRE ATT&CK technique ID from the allowed list, or "none" if nothing fits.
Tampering the verifier found (deleted, edited, inserted, reordered or truncated lines) is
itself an attacker step — describe it from the verifier finding and cite it in citedFindings.
If the evidence shows no attack, return an empty list rather than inventing one.
Allowed techniques:
${MITRE_TECHNIQUES.map((t) => `- ${t.id} ${t.name} (${t.tactic})`).join("\n")}

${CITATION_RULES}`;

export const TIMELINE_SCHEMA = {
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          techniqueId: { type: "string", enum: [...TECHNIQUE_IDS, "none"] },
          ...CITATION_PROPERTIES,
        },
        required: ["title", "description", "techniqueId", "citedEntries", "citedFindings"],
        additionalProperties: false,
      },
    },
  },
  required: ["steps"],
  additionalProperties: false,
};

export function buildTimelinePrompt(ctx: EvidenceContext): string {
  return `${renderEvidence(ctx)}\n\nBuild the attack timeline now.`;
}

export function toAttackTimeline(raw: RawTimelineStep[] | undefined, ctx: EvidenceContext, generatedAt = Date.now()): AttackTimeline {
  const tsBySeq = new Map<number, number>();
  for (const v of ctx.verifiedEntries) tsBySeq.set(v.seq, v.ts);
  for (const f of ctx.flaggedEntries) if (typeof f.ts === "number") tsBySeq.set(f.seq, f.ts);

  const toStep = (s: RawTimelineStep & Cited): TimelineStep => {
    const times = [...s.citedEntries, ...s.citedFindings]
      .map((seq) => tsBySeq.get(seq))
      .filter((t): t is number => typeof t === "number");
    return {
      title: String(s.title ?? "").trim(),
      description: String(s.description ?? "").trim(),
      technique: lookupTechnique(s.techniqueId),
      citedEntries: s.citedEntries,
      citedFindings: s.citedFindings,
      firstTs: times.length ? Math.min(...times) : null,
      source: "model",
    };
  };

  const { kept, blocked } = partitionByEvidence(raw, ctx.verifiedSeqs, ctx.flaggedSeqs);
  const steps = kept.map(toStep).filter((s) => s.title || s.description);

  // A killed agent leaves no log line to cite, so the model can't evidence it; the
  // verifier's own silence alert is the evidence, added here deterministically.
  if (ctx.silence.triggered) {
    steps.push({
      title: "Logging agent silenced",
      description: `No anchor reached the chain for ${ctx.silence.secondsSinceLastAnchor ?? "?"}s, so the verifier raised ANCHOR_SILENCE.`,
      technique: lookupTechnique("T1562.001"),
      citedEntries: [],
      citedFindings: [],
      firstTs: null,
      source: "verifier",
    });
  }

  steps.sort((a, b) => (a.firstTs ?? Infinity) - (b.firstTs ?? Infinity));
  return { steps, blockedSteps: blocked.map(toStep), generatedAt };
}
