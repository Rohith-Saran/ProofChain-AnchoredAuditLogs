/**
 * CERT-In incident report auto-fill. The model picks the incident type and extracts
 * hosts / accounts / indicators and description sentences, each with citations. Code then:
 *  - blocks any extracted value that doesn't literally appear in an entry it cites
 *    (stronger than checking the seq exists), and
 *  - computes every time field itself: occurredAt, detectedAt and the 6-hour reporting
 *    deadline from CERT-In Directions No. 20(3)/2022-CERT-In (28 April 2022).
 */
import { CITATION_PROPERTIES, CITATION_RULES, partitionByEvidence, renderEvidence, type Cited } from "./evidence.ts";
import type { EvidenceContext } from "./verifierClient.ts";
import type { CertInReport, CitedSentence, CitedValue } from "../../evidence/src/aiReport.ts";
export type { CertInReport, CitedSentence, CitedValue };

/** Incident types from Annexure I of the CERT-In Directions that this system can observe,
 *  plus "Other". Labels follow published summaries of the Annexure; check the official
 *  text on cert-in.org.in before filing. */
export const CERT_IN_INCIDENT_TYPES = [
  "Targeted scanning/probing of critical networks/systems",
  "Compromise of critical systems/information",
  "Unauthorised access of IT systems/data",
  "Attacks on servers such as Database, Mail and DNS and network devices such as Routers",
  "Data Breach",
  "Other",
] as const;

export const REPORTING_WINDOW_MS = 6 * 60 * 60 * 1000;

export interface RawCertInReport {
  incidentType?: string;
  affectedHosts?: Partial<CitedValue>[];
  affectedAccounts?: Partial<CitedValue>[];
  indicators?: Partial<CitedValue>[];
  description?: Partial<CitedSentence>[];
}

export const CERT_IN_SYSTEM = `You are SakshiLog's incident responder, filling in an incident report for CERT-In (India).
From the log audit, choose the single best incidentType from the allowed list, and extract:
- affectedHosts: hostnames exactly as written in the cited entries
- affectedAccounts: user/account names exactly as written in the cited entries
- indicators: IP addresses and file paths exactly as written in the cited entries
- description: 2 to 6 one-sentence facts about what happened
Copy each extracted value character-for-character from the entry text you cite; a code
checker blocks any value that does not appear verbatim in its cited entries.
Do not write dates, times or deadlines — those are computed separately.

${CITATION_RULES}`;

const VALUE_LIST = {
  type: "array",
  items: {
    type: "object",
    properties: { value: { type: "string" }, ...CITATION_PROPERTIES },
    required: ["value", "citedEntries", "citedFindings"],
    additionalProperties: false,
  },
};

export const CERT_IN_SCHEMA = {
  type: "object",
  properties: {
    incidentType: { type: "string", enum: [...CERT_IN_INCIDENT_TYPES] },
    affectedHosts: VALUE_LIST,
    affectedAccounts: VALUE_LIST,
    indicators: VALUE_LIST,
    description: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" }, ...CITATION_PROPERTIES },
        required: ["text", "citedEntries", "citedFindings"],
        additionalProperties: false,
      },
    },
  },
  required: ["incidentType", "affectedHosts", "affectedAccounts", "indicators", "description"],
  additionalProperties: false,
};

export function buildCertInPrompt(ctx: EvidenceContext): string {
  return `${renderEvidence(ctx)}\n\nFill in the CERT-In incident report now.`;
}

export function toCertInReport(raw: RawCertInReport, ctx: EvidenceContext, generatedAt = Date.now()): CertInReport {
  const textBySeq = new Map<number, string>();
  const tsBySeq = new Map<number, number>();
  for (const v of ctx.verifiedEntries) {
    textBySeq.set(v.seq, `${v.host ?? ""} ${v.source} ${v.message}`);
    tsBySeq.set(v.seq, v.ts);
  }
  for (const f of ctx.flaggedEntries) {
    textBySeq.set(f.seq, f.detail);
    if (typeof f.ts === "number") tsBySeq.set(f.seq, f.ts);
  }

  const blocked: CertInReport["blocked"] = [];
  const reject = (field: string, text: string, c: Cited) =>
    blocked.push({ field, text, citedEntries: c.citedEntries, citedFindings: c.citedFindings });

  const checkValues = (field: string, items: Partial<CitedValue>[] | undefined): CitedValue[] => {
    const { kept, blocked: bad } = partitionByEvidence(items, ctx.verifiedSeqs, ctx.flaggedSeqs);
    for (const b of bad) reject(field, String(b.value ?? ""), b);
    const out: CitedValue[] = [];
    for (const k of kept) {
      const value = String(k.value ?? "").trim();
      const cited = [...k.citedEntries, ...k.citedFindings];
      const appears = value !== "" && cited.some((seq) => (textBySeq.get(seq) ?? "").includes(value));
      if (appears && !out.some((o) => o.value === value)) {
        out.push({ value, citedEntries: k.citedEntries, citedFindings: k.citedFindings });
      } else if (!appears) {
        reject(field, value, k);
      }
    }
    return out;
  };

  const affectedHosts = checkValues("affectedHosts", raw.affectedHosts);
  const affectedAccounts = checkValues("affectedAccounts", raw.affectedAccounts);
  const indicators = checkValues("indicators", raw.indicators);

  const desc = partitionByEvidence(raw.description, ctx.verifiedSeqs, ctx.flaggedSeqs);
  for (const b of desc.blocked) reject("description", String(b.text ?? ""), b);
  const description = desc.kept
    .map((d) => ({ text: String(d.text ?? "").trim(), citedEntries: d.citedEntries, citedFindings: d.citedFindings }))
    .filter((d) => d.text);

  const allCited = [...affectedHosts, ...affectedAccounts, ...indicators, ...description].flatMap((i) => [
    ...i.citedEntries,
    ...i.citedFindings,
  ]);
  const times = allCited.map((seq) => tsBySeq.get(seq)).filter((t): t is number => typeof t === "number");

  const incidentType = (CERT_IN_INCIDENT_TYPES as readonly string[]).includes(String(raw.incidentType))
    ? String(raw.incidentType)
    : "Other";

  return {
    incidentType,
    affectedHosts,
    affectedAccounts,
    indicators,
    description,
    blocked,
    occurredAt: times.length ? Math.min(...times) : null,
    detectedAt: ctx.generatedAt,
    reportingDeadline: ctx.generatedAt + REPORTING_WINDOW_MS,
    tampering: { tamperedCount: ctx.summary.tamperedCount, silenceTriggered: ctx.silence.triggered },
    reportTo: "incident@cert-in.org.in",
    generatedAt,
  };
}
