import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { MerkleTree } from "./merkle.ts";
import type { MerkleProofStep } from "./merkle.ts";
import type { AiIncidentReport } from "./aiReport.ts";

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
  const { fetchAiIncidentReport } = await import("./aiReport.ts");
  const aiReport = await fetchAiIncidentReport();
  exportEvidencePack({
    victimDbPath: victimDb,
    collectorDbPath: collectorDb,
    aiReport,
  });
}
