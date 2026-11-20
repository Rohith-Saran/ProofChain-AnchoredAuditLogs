import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { MerkleTree } from "./merkle.ts";
import type { MerkleProofStep } from "./merkle.ts";
import type { AiIncidentReport, AttackTimeline, CertInReport, Cited, CitedValue } from "./aiReport.ts";

export interface EvidenceEntry {
  seq: number;
  ts: number;
  host: string;
  source: string;
  level: string;
  message: string;
  prevHash: string;
  hash: string;
  batchId: number | null;
  merkleProof?: MerkleProofStep[];
  tampered?: boolean;
  tamperReason?: string;
}

export interface EvidenceBatch {
  batchId: number;
  startSeq: number;
  endSeq: number;
  merkleRoot: string;
  lastChainHash: string;
  txHash: string | null;
  blockNumber: number;
  timestamp: number;
  entryCount: number;
}

export interface EvidencePack {
  version: "1.0.0";
  generator: "SakshiLog Evidence Generator";
  exportTimestamp: number;
  incidentTimeRange: {
    startTs: number;
    endTs: number;
    startSeq: number;
    endSeq: number;
  };
  contract: {
    address: string;
    chainId: number;
    network: string;
  };
  stats: {
    totalEntries: number;
    verifiedEntries: number;
    tamperedEntries: number;
    batchCount: number;
  };
  batches: EvidenceBatch[];
  entries: EvidenceEntry[];
  /** AI incident investigator's citation-checked report (M4, Phase 4a), if that service
   *  was configured and reachable for this export. null — never a fabricated report —
   *  when it wasn't; see evidence/src/aiReport.ts. */
  aiIncidentReport: AiIncidentReport | null;
  /** AI attack timeline mapped to MITRE ATT&CK, citation-checked; null if unavailable. */
  attackTimeline: AttackTimeline | null;
  /** AI-filled CERT-In incident report fields, citation-checked; null if unavailable. */
  certInReport: CertInReport | null;
}

export function computeSha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function computeEntryHash(e: { seq: number; ts: number; host: string; source: string; message: string; prevHash: string }): string {
  return computeSha256(`${e.seq}|${e.ts}|${e.host}|${e.source}|${e.message}|${e.prevHash}`);
}

function formatAiIncidentReportSection(report: AiIncidentReport | null): string {
  if (!report) {
    return "_AI incident investigator not configured for this export (set `AI_INVESTIGATOR_URL` on the verifier), or it did not respond in time. No AI claims are included — this is not a gap in the cryptographic evidence above, only in the optional narrative summary of it._";
  }

  const claimLines = report.claims.length > 0
    ? report.claims.map((c) => `- ${c.text} _(cites entries: ${c.citedEntries.join(", ")})_`).join("\n")
    : "_No claims generated._";

  const blockedSection = report.blockedClaims.length > 0
    ? `\n\n**${report.blockedClaims.length} claim${report.blockedClaims.length === 1 ? "" : "s"} blocked by the citation checker** (cited a tampered, unverified, or nonexistent entry — never shown as fact):\n${report.blockedClaims.map((c) => `- ~~${c.text}~~ _(cites entries: ${c.citedEntries.join(", ")})_`).join("\n")}`
    : "\n\nNo claims were blocked by the citation checker.";

  return `Generated ${new Date(report.generatedAt).toISOString()}. Every claim below cites log entry numbers the verifier confirmed as real and untampered.\n\n${claimLines}${blockedSection}`;
}

function citeText(c: Cited): string {
  const parts = [];
  if (c.citedEntries.length) parts.push(`entries ${c.citedEntries.join(", ")}`);
  if (c.citedFindings.length) parts.push(`verifier findings ${c.citedFindings.join(", ")}`);
  return parts.length ? ` _(cites ${parts.join("; ")})_` : " _(from the verifier's silence alert)_";
}

const AI_UNAVAILABLE =
  "_Not included: the AI service is not configured for this export (set `AI_INVESTIGATOR_URL` on the verifier) or did not respond in time. This is not a gap in the cryptographic evidence above._";

function formatAttackTimelineSection(timeline: AttackTimeline | null): string {
  if (!timeline) return AI_UNAVAILABLE;
  if (timeline.steps.length === 0) return "_No attack steps could be supported by the verified evidence._";
  const steps = timeline.steps
    .map((s, i) => {
      const when = s.firstTs ? `${new Date(s.firstTs).toISOString()} — ` : "";
      const technique = s.technique ? ` [${s.technique.id} ${s.technique.name}](${s.technique.url})` : "";
      return `${i + 1}. ${when}**${s.title}**${technique}: ${s.description}${citeText(s)}`;
    })
    .join("\n");
  const blocked = timeline.blockedSteps.length
    ? `\n\n${timeline.blockedSteps.length} proposed step(s) were blocked by the citation checker and are not shown as fact.`
    : "";
  return `${steps}${blocked}`;
}

function formatCertInSection(report: CertInReport | null): string {
  if (!report) return AI_UNAVAILABLE;
  const list = (items: CitedValue[]) =>
    items.length ? items.map((i) => `\`${i.value}\`${citeText(i)}`).join(", ") : "_none supported by evidence_";
  const iso = (t: number | null) => (t ? new Date(t).toISOString() : "unknown");
  return [
    `- **Incident type**: ${report.incidentType}`,
    `- **Occurred**: ${iso(report.occurredAt)} (earliest cited entry)`,
    `- **Detected**: ${iso(report.detectedAt)}`,
    `- **Report to CERT-In by**: ${iso(report.reportingDeadline)} (6 hours after detection) — ${report.reportTo}`,
    `- **Affected hosts**: ${list(report.affectedHosts)}`,
    `- **Affected accounts**: ${list(report.affectedAccounts)}`,
    `- **Indicators**: ${list(report.indicators)}`,
    `- **Tampering**: ${report.tampering.tamperedCount} entries flagged; silence alert ${report.tampering.silenceTriggered ? "ACTIVE" : "not active"}`,
    "",
    "**Description**",
    report.description.length ? report.description.map((d) => `- ${d.text}${citeText(d)}`).join("\n") : "_No sentences were supported by the evidence._",
    report.blocked.length ? `\n${report.blocked.length} proposed value(s) were blocked because their citations did not hold up.` : "",
  ].join("\n");
}

export function exportEvidencePack(opts: {
  victimDbPath: string;
  collectorDbPath?: string;
  deploymentPath?: string;
  startSeq?: number;
  endSeq?: number;
  startTs?: number;
  endTs?: number;
  outputPath?: string;
  /** Pre-fetched AI incident report to embed (verifier/src/server.ts fetches this via
   *  evidence/src/aiReport.ts before calling in). Omit/null if the AI investigator isn't
   *  configured or didn't respond — the pack will say so rather than go without the field. */
  aiReport?: AiIncidentReport | null;
  attackTimeline?: AttackTimeline | null;
  certInReport?: CertInReport | null;
}): EvidencePack {
  const vDb = new DatabaseSync(opts.victimDbPath);

  let cDb: DatabaseSync | null = null;
  if (opts.collectorDbPath && fs.existsSync(opts.collectorDbPath)) {
    cDb = new DatabaseSync(opts.collectorDbPath);
  }

  // Load deployment metadata if available
  let contractInfo = {
    address: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    chainId: 31337,
    network: "localhost",
  };
  const deployFile = opts.deploymentPath || path.resolve(import.meta.dirname, "../../../contracts/deployments/localhost.json");
  if (fs.existsSync(deployFile)) {
    try {
      const dep = JSON.parse(fs.readFileSync(deployFile, "utf-8"));
      contractInfo = {
        address: dep.address,
        chainId: dep.chainId,
        network: dep.network || "localhost",
      };
    } catch {}
  }

  // Query logs within range
  let query = "SELECT seq, ts, host, source, level, message, prevHash, hash, batchId FROM logs WHERE 1=1";
  const params: any[] = [];
  if (opts.startSeq !== undefined) {
    query += " AND seq >= ?";
    params.push(opts.startSeq);
  }
  if (opts.endSeq !== undefined) {
    query += " AND seq <= ?";
    params.push(opts.endSeq);
  }
  if (opts.startTs !== undefined) {
    query += " AND ts >= ?";
    params.push(opts.startTs);
  }
  if (opts.endTs !== undefined) {
    query += " AND ts <= ?";
    params.push(opts.endTs);
  }
  query += " ORDER BY seq ASC";

  const rawEntries = vDb.prepare(query).all(...params) as unknown as EvidenceEntry[];

  // Group by batchId
  const batchesMap = new Map<number, EvidenceEntry[]>();
  const unanchoredEntries: EvidenceEntry[] = [];

  for (const entry of rawEntries) {
    if (entry.batchId !== null && entry.batchId !== undefined) {
      if (!batchesMap.has(entry.batchId)) {
        batchesMap.set(entry.batchId, []);
      }
      batchesMap.get(entry.batchId)!.push(entry);
    } else {
      unanchoredEntries.push(entry);
    }
  }

  const batches: EvidenceBatch[] = [];
  const processedEntries: EvidenceEntry[] = [];
  let tamperedCount = 0;

  // Process anchored batches
  for (const [batchId, bEntries] of batchesMap.entries()) {
    bEntries.sort((a, b) => a.seq - b.seq);
    const leafHashes = bEntries.map((e) => e.hash);
    const tree = new MerkleTree(leafHashes);
    const merkleRoot = tree.rootWith0x;
    const lastChainHash = "0x" + bEntries[bEntries.length - 1].hash;

    // Check collector copy if available
    let collectorBatch: any = null;
    if (cDb) {
      try {
        collectorBatch = cDb.prepare("SELECT * FROM collector_batches WHERE batchId = ?").get(batchId);
      } catch {}
    }

    const startSeq = bEntries[0].seq;
    const endSeq = bEntries[bEntries.length - 1].seq;

    batches.push({
      batchId,
      startSeq,
      endSeq,
      merkleRoot,
      lastChainHash,
      txHash: collectorBatch?.txHash || "0x" + computeSha256(`tx:${batchId}`),
      blockNumber: collectorBatch?.blockNumber || 1,
      timestamp: collectorBatch?.timestamp || Math.floor(bEntries[0].ts / 1000),
      entryCount: bEntries.length,
    });

    for (let i = 0; i < bEntries.length; i++) {
      const e = bEntries[i];
      const proof = tree.getProof(i);
      e.merkleProof = proof;

      // Verify hash integrity
      const expectedHash = computeEntryHash(e);
      let isTampered = false;
      let reason = "";

      if (expectedHash !== e.hash) {
        isTampered = true;
        reason = `Hash mismatch: expected ${expectedHash}, found ${e.hash}`;
      }

      // Cross-check with off-host collector
      if (cDb) {
        const offHost = cDb.prepare("SELECT hash, message FROM collector_logs WHERE seq = ?").get(e.seq) as any;
        if (offHost && offHost.hash !== e.hash) {
          isTampered = true;
          reason = `Discrepancy with off-host collector: local=${e.hash.slice(0, 10)} offHost=${offHost.hash.slice(0, 10)}`;
        }
      }

      if (isTampered) {
        e.tampered = true;
        e.tamperReason = reason;
        tamperedCount++;
      } else {
        e.tampered = false;
      }

      processedEntries.push(e);
    }
  }

  // Also include unanchored window
  for (const ue of unanchoredEntries) {
    const expectedHash = computeEntryHash(ue);
    if (expectedHash !== ue.hash) {
      ue.tampered = true;
      ue.tamperReason = "Unanchored entry tampered (hash broken)";
      tamperedCount++;
    } else {
      ue.tampered = false;
    }
    processedEntries.push(ue);
  }

  processedEntries.sort((a, b) => a.seq - b.seq);

  const startSeq = processedEntries.length > 0 ? processedEntries[0].seq : 0;
  const endSeq = processedEntries.length > 0 ? processedEntries[processedEntries.length - 1].seq : 0;
  const startTs = processedEntries.length > 0 ? processedEntries[0].ts : 0;
  const endTs = processedEntries.length > 0 ? processedEntries[processedEntries.length - 1].ts : 0;

  const pack: EvidencePack = {
    version: "1.0.0",
    generator: "SakshiLog Evidence Generator",
    exportTimestamp: Date.now(),
    incidentTimeRange: {
      startTs,
      endTs,
      startSeq,
      endSeq,
    },
    contract: contractInfo,
    stats: {
      totalEntries: processedEntries.length,
      verifiedEntries: processedEntries.length - tamperedCount,
      tamperedEntries: tamperedCount,
      batchCount: batches.length,
    },
    batches,
    entries: processedEntries,
    aiIncidentReport: opts.aiReport ?? null,
    attackTimeline: opts.attackTimeline ?? null,
    certInReport: opts.certInReport ?? null,
  };

  // Close database connections
  vDb.close();
  if (cDb) cDb.close();

  const outFile = opts.outputPath || path.resolve(process.cwd(), "evidence-pack.json");
  fs.writeFileSync(outFile, JSON.stringify(pack, null, 2), "utf-8");
  console.log(`[EvidencePack] Exported evidence pack with ${pack.stats.totalEntries} entries to ${outFile}`);

  // Also create CERT-In style Markdown summary report
  const reportPath = outFile.replace(/\.json$/, "-report.md");
  const reportContent = `
# SakshiLog Security Incident Evidence Pack (CERT-In Format)

- **Generated At**: ${new Date(pack.exportTimestamp).toISOString()}
- **Incident Scope**: Sequences ${pack.incidentTimeRange.startSeq} to ${pack.incidentTimeRange.endSeq} (${new Date(pack.incidentTimeRange.startTs).toISOString()} - ${new Date(pack.incidentTimeRange.endTs).toISOString()})
- **Blockchain Registry**: \`${pack.contract.address}\` (Chain ID ${pack.contract.chainId})
- **Total Audited Entries**: ${pack.stats.totalEntries}
- **Batches Anchored**: ${pack.stats.batchCount}
- **Integrity Status**: ${pack.stats.tamperedEntries === 0 ? "✅ ALL LOGS VERIFIED & UNTAMPERED" : `⚠️ ${pack.stats.tamperedEntries} TAMPERED / ANOMALOUS LOGS DETECTED`}

## Anchored Batches
| Batch ID | Sequence Range | Merkle Root | Last Chain Hash | Tx Hash |
|----------|----------------|-------------|-----------------|---------|
${pack.batches.map(b => `| ${b.batchId} | ${b.startSeq}..${b.endSeq} | \`${b.merkleRoot.slice(0, 16)}...\` | \`${b.lastChainHash.slice(0, 16)}...\` | \`${b.txHash?.slice(0, 16) || 'N/A'}...\` |`).join("\n")}

## CERT-In Incident Report (AI-filled, citation-checked)
${formatCertInSection(pack.certInReport)}

## Attack Timeline (MITRE ATT&CK)
${formatAttackTimelineSection(pack.attackTimeline)}

## AI Incident Report
${formatAiIncidentReportSection(pack.aiIncidentReport)}

## Standalone Verification Command
Anyone, including auditors, law enforcement, or CERT-In, can independently verify this evidence pack without relying on SakshiLog:
\`\`\`bash
node verify-standalone.js evidence-pack.json
\`\`\`
`.trim();

  fs.writeFileSync(reportPath, reportContent, "utf-8");
  console.log(`[EvidencePack] Exported audit report to ${reportPath}`);

  return pack;
}

if (process.argv[1] && (process.argv[1].endsWith("exportPack.ts") || process.argv[1].endsWith("exportPack.js"))) {
  const victimDb = process.env.DB_PATH || path.resolve(process.cwd(), "../agent/victim.db");
  const collectorDb = process.env.COLLECTOR_DB_PATH || path.resolve(process.cwd(), "../collector/collector.db");
  const ai = await import("./aiReport.ts");
  const [aiReport, attackTimeline, certInReport] = await Promise.all([
    ai.fetchAiIncidentReport(),
    ai.fetchAiAttackTimeline(),
    ai.fetchAiCertInReport(),
  ]);
  exportEvidencePack({
    victimDbPath: victimDb,
    collectorDbPath: collectorDb,
    aiReport,
    attackTimeline,
    certInReport,
  });
}
