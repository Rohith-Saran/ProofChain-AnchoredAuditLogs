/**
 * Attack 7: kill the agent process. No new batches (not even heartbeats) can land once
 * it's dead, so the *absence* of anchors becomes the alert (ANCHOR_SILENCE).
 * Usage: node --experimental-strip-types src/07-kill-agent.ts [port]
 *
 * Finds whatever process is listening on the agent's port and kills it — the same
 * effect a real attacker gets from `kill -9` or `taskkill` once they have a shell.
 */
import { execSync } from "node:child_process";
import { banner, log } from "./common.ts";

const port = Number(process.argv[2] || process.env.AGENT_PORT || 4001);

banner(`ATTACK 7: Kill the agent (port ${port})`);

function findAndKillWindows(p: number): boolean {
  const out = execSync(`netstat -ano | findstr :${p}`, { encoding: "utf-8" }).trim();
  const pids = new Set<string>();
  for (const line of out.split("\n")) {
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && /^\d+$/.test(pid)) pids.add(pid);
  }
  if (pids.size === 0) return false;
  for (const pid of pids) {
    execSync(`taskkill /F /PID ${pid}`, { encoding: "utf-8" });
    log(`Killed PID ${pid} (was listening on port ${p})`);
  }
  return true;
}

function findAndKillPosix(p: number): boolean {
  const out = execSync(`lsof -t -i:${p}`, { encoding: "utf-8" }).trim();
  if (!out) return false;
  for (const pid of out.split("\n").filter(Boolean)) {
    execSync(`kill -9 ${pid}`);
    log(`Killed PID ${pid} (was listening on port ${p})`);
  }
  return true;
}

try {
  const killed = process.platform === "win32" ? findAndKillWindows(port) : findAndKillPosix(port);
  if (!killed) {
    log(`No process found listening on port ${port}. Is the agent already down, or running elsewhere?`);
    process.exitCode = 1;
  } else {
    log("Agent is dead. No further batches (including heartbeats) will be anchored.");
    log("Expected: plain hash chain has no concept of silence (Missed) | SakshiLog verdict: ANCHOR_SILENCE once 2x the anchor interval has elapsed.");
  }
} catch (err) {
  log(`Could not find/kill a process on port ${port}: ${(err as Error).message}`);
  log("Fallback: stop the agent process manually (Ctrl+C in its terminal, or Task Manager / kill its PID).");
  process.exitCode = 1;
}
