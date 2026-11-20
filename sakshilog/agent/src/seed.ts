/**
 * SakshiLog Demo Data Pre-loader (Phase 5, M2)
 * 
 * Pre-loads realistic security events and anchors an initial baseline batch
 * so that when the team presents to judges, the live console immediately shows:
 *  1. An authentic SHA-256 hash-chained log stream (auth, sudo, auditd, kernel, cron)
 *  2. An anchored on-chain Merkle batch with transaction hash & block number
 *  3. Verifier reporting 100% OK status
 *  4. Perfect target entries for the 8 attack vectors (especially Attack 2 & Attack 6's sudo bash)
 * 
 * Works in two modes:
 *  - Online Mode: Sends events to live Agent API (port 4001) and triggers on-chain anchor
 *  - Offline Mode: Directly populates victim.db and collector.db using AgentDB and CollectorDB
 */
import { AgentDB } from "./db.ts";
import { HashChain } from "./hashChain.ts";
import { CollectorClient } from "./collectorClient.ts";
import { AnchorConnector } from "./anchorServiceConnector.ts";
import * as path from "node:path";
import * as fs from "node:fs";

export interface DemoLogItem {
  source: string;
  level: "info" | "notice" | "warning" | "error";
  message: string;
  host?: string;
  delayMs?: number;
}

export const CURATED_DEMO_SCENARIO: DemoLogItem[] = [
  {
    source: "systemd",
    level: "info",
    message: "Started SakshiLog Integrity Monitoring Daemon (sakshilog-agent.service).",
  },
  {
    source: "kernel",
    level: "info",
    message: "audit: type=2000 audit(1732100000.010:1): initialized",
  },
  {
    source: "sshd",
    level: "info",
    message: "Server listening on 0.0.0.0 port 22.",
  },
  {
    source: "auth",
    level: "info",
    message: "Accepted publickey for ubuntu from 192.168.1.42 port 52310 ssh2: RSA SHA256:7mP0wE...",
  },
  {
    source: "auth",
    level: "info",
    message: "pam_unix(sshd:session): session opened for user ubuntu by (uid=0)",
  },
  {
    source: "sudo",
    level: "notice",
    message: "ubuntu : TTY=pts/0 ; PWD=/home/ubuntu ; USER=root ; COMMAND=/usr/bin/apt-get update",
  },
  {
    source: "auditd",
    level: "info",
    message: `type=CONFIG_CHANGE op=add_rule key="identity" list=4 res=1`,
  },
  {
    source: "auditd",
    level: "info",
    message: `type=SYSCALL arch=c000003e syscall=257 success=yes exit=3 comm="cat" exe="/usr/bin/cat" path="/var/log/auth.log"`,
  },
  {
    source: "cron",
    level: "info",
    message: "(root) CMD (test -x /usr/sbin/anacron || run-parts --report /etc/cron.daily)",
  },
  {
    source: "nginx",
    level: "info",
    message: `192.168.1.100 - - [20/Nov/2026:14:15:02 +0000] "GET /api/v1/health HTTP/1.1" 200 45`,
  },
  {
    source: "auth",
    level: "warning",
    message: "pam_unix(sshd:auth): check pass; user unknown",
  },
  {
    source: "auth",
    level: "warning",
    message: "Failed password for invalid user admin from 198.51.100.42 port 44122 ssh2",
  },
  {
    source: "kernel",
    level: "warning",
    message: "iptables: DROP IN=eth0 OUT= SRC=198.51.100.42 DST=10.0.0.1 PROTO=TCP SPT=44122 DPT=22",
  },
  {
    source: "auth",
    level: "info",
    message: "Accepted publickey for deploy from 10.0.4.88 port 39120 ssh2",
  },
  {
    source: "sudo",
    level: "notice",
    message: "deploy : TTY=pts/1 ; PWD=/opt/app ; USER=root ; COMMAND=/usr/bin/systemctl restart app.service",
  },
  {
    source: "systemd",
    level: "info",
    message: "Stopping Application Container Service...",
  },
  {
    source: "systemd",
    level: "info",
    message: "Started Application Container Service.",
  },
  {
    source: "auditd",
    level: "notice",
    message: `type=PATH name="/etc/pam.d/common-auth" inode=132456 dev=fd:00 mode=0100644 ouid=0 ogid=0`,
  },
  {
    source: "sshd",
    level: "info",
    message: "Received disconnect from 192.168.1.42 port 52310: 11: disconnected by user",
  },
  {
    source: "auth",
    level: "info",
    message: "pam_unix(sshd:session): session closed for user ubuntu",
  },
  {
    source: "auth",
    level: "info",
    message: "session opened for user secops by (uid=0)",
  },
  {
    source: "sudo",
    level: "notice",
    message: "secops : TTY=pts/2 ; PWD=/home/secops ; USER=root ; COMMAND=/usr/sbin/auditctl -l",
  },
  {
    source: "cron",
    level: "info",
    message: "(root) CMD (/usr/sbin/logrotate /etc/logrotate.conf)",
  },
  // The critical sudo bash command targeted by Attack 2 (deletion) and Attack 6 (delete-recompute)
  {
    source: "sudo",
    level: "notice",
    message: "ubuntu : TTY=pts/0 ; PWD=/home/ubuntu ; USER=root ; COMMAND=/bin/bash",
  },
  {
    source: "auditd",
    level: "warning",
    message: `type=SYSCALL arch=c000003e syscall=openat success=yes comm="cat" path="/etc/shadow" key="credentials"`,
  },
];

export async function isAgentAlive(url = "http://127.0.0.1:4001"): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Pre-load realistic security data into SakshiLog.
 */
export async function seedDemoData(options: {
  agentUrl?: string;
  count?: number;
  anchor?: boolean;
  dbPath?: string;
  collectorUrl?: string;
} = {}): Promise<{
  success: boolean;
  mode: "online" | "offline";
  logsCount: number;
  anchoredBatchId?: number;
  message: string;
}> {
  const agentUrl = options.agentUrl || process.env.AGENT_URL || "http://127.0.0.1:4001";
  const shouldAnchor = options.anchor !== false;
  const targetLogs = CURATED_DEMO_SCENARIO.slice(0, options.count || CURATED_DEMO_SCENARIO.length);

  const online = await isAgentAlive(agentUrl);

  if (online) {
    console.log(`[Seed] Agent online at ${agentUrl}. Seeding ${targetLogs.length} logs via API...`);
    let written = 0;

    for (const item of targetLogs) {
      try {
        const res = await fetch(`${agentUrl}/api/logs/write`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
        if (res.ok) written++;
      } catch (err) {
        console.warn(`[Seed] Failed writing entry: ${(err as Error).message}`);
      }
    }

    let batchId: number | undefined;
    if (shouldAnchor) {
      console.log("[Seed] Triggering on-chain Merkle batch anchor...");
      try {
        const res = await fetch(`${agentUrl}/api/anchor/trigger`, { method: "POST" });
        if (res.ok) {
          const body = (await res.json()) as any;
          batchId = body.batch?.batchId;
          console.log(`[Seed] Successfully anchored Batch #${batchId} on blockchain!`);
        }
      } catch (err) {
        console.warn(`[Seed] Anchor trigger warning: ${(err as Error).message}`);
      }
    }

    return {
      success: true,
      mode: "online",
      logsCount: written,
      anchoredBatchId: batchId,
      message: `Online seed complete: ${written} logs written to agent and collector. Batch #${batchId ?? "none"} anchored.`,
    };
  }

  // Offline mode: direct SQLite store population
  console.log("[Seed] Agent not responding on HTTP. Seeding directly into SQLite database files...");
  const victimDbPath = options.dbPath || path.resolve(process.cwd(), "victim.db");
  const collectorUrl = options.collectorUrl || process.env.COLLECTOR_URL || "http://127.0.0.1:4002";

  const db = new AgentDB(victimDbPath);
  const collector = new CollectorClient(collectorUrl);
  const chain = new HashChain(db, collector, "victim-server");
  const connector = new AnchorConnector(db, collector, { intervalMs: 5000 });

  const entries = chain.appendBulk(targetLogs);
  console.log(`[Seed] Wrote ${entries.length} hash-chained entries to ${victimDbPath}`);

  let batchId: number | undefined;
  if (shouldAnchor) {
    try {
      const batch = await connector.triggerBatch();
      if (batch) {
        batchId = batch.batchId;
        console.log(`[Seed] Anchored Batch #${batch.batchId} with root: ${batch.merkleRoot.slice(0, 16)}...`);
      }
    } catch (err) {
      console.log(`[Seed] Could not anchor on-chain directly (local node may not be running): ${(err as Error).message}`);
    }
  }

  collector.close();
  db.close();

  return {
    success: true,
    mode: "offline",
    logsCount: entries.length,
    anchoredBatchId: batchId,
    message: `Offline seed complete: ${entries.length} logs generated directly in SQLite.`,
  };
}

// Standalone execution
if (process.argv[1] && (process.argv[1].endsWith("seed.ts") || process.argv[1].endsWith("seed.js"))) {
  console.log("==================================================================");
  console.log("             SakshiLog Demo Data Pre-Loader (Phase 5)             ");
  console.log("==================================================================");

  seedDemoData()
    .then((result) => {
      console.log(`\n  ✓ ${result.message}`);
      console.log("  ✓ Ready for demo presentation & live attack console.");
      console.log("==================================================================\n");
    })
    .catch((err) => {
      console.error("[Seed Error]", err);
      process.exit(1);
    });
}
