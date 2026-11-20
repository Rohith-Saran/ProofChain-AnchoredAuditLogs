import { HashChain } from "./hashChain.ts";
import type { AppendOptions } from "./hashChain.ts";

const REALISTIC_USERS = ["admin", "root", "alice", "bob", "deploy", "secops", "developer"];
const IPS = ["192.168.1.15", "10.0.4.88", "172.16.20.5", "198.51.100.42", "203.0.113.19"];

export interface ActionTemplate {
  source: string;
  level: string;
  createMessage: () => string;
}

export const ACTION_TEMPLATES: Record<string, ActionTemplate[]> = {
  login: [
    {
      source: "auth",
      level: "info",
      createMessage: () => `Accepted publickey for ${rand(REALISTIC_USERS)} from ${rand(IPS)} port ${randInt(1024, 65535)} ssh2`,
    },
    {
      source: "auth",
      level: "warning",
      createMessage: () => `Failed password for invalid user hacker from ${rand(IPS)} port ${randInt(1024, 65535)} ssh2`,
    },
    {
      source: "auth",
      level: "info",
      createMessage: () => `session opened for user ${rand(REALISTIC_USERS)} by (uid=0)`,
    },
  ],
  sudo: [
    {
      source: "sudo",
      level: "notice",
      createMessage: () => `${rand(REALISTIC_USERS)} : TTY=pts/1 ; PWD=/home ; USER=root ; COMMAND=/usr/bin/apt-get update`,
    },
    {
      source: "sudo",
      level: "warning",
      createMessage: () => `${rand(REALISTIC_USERS)} : 1 incorrect password attempt ; TTY=pts/2 ; PWD=/root ; USER=root ; COMMAND=/bin/bash`,
    },
    {
      source: "sudo",
      level: "notice",
      createMessage: () => `${rand(REALISTIC_USERS)} : TTY=pts/0 ; PWD=/etc/nginx ; USER=root ; COMMAND=/usr/sbin/nginx -s reload`,
    },
  ],
  file: [
    {
      source: "auditd",
      level: "info",
      createMessage: () => `type=SYSCALL arch=c000003e syscall=2 success=yes exit=3 a0=7fffc a1=0 items=1 ppid=1200 pid=1455 comm="cat" exe="/usr/bin/cat" key="shadow" path="/etc/shadow"`,
    },
    {
      source: "auditd",
      level: "warning",
      createMessage: () => `type=PATH name="/etc/pam.d/common-auth" inode=132456 dev=fd:00 mode=0100644 ouid=0 ogid=0 rdev=00:00 nametype=NORMAL`,
    },
    {
      source: "auditd",
      level: "info",
      createMessage: () => `type=CONFIG_CHANGE op=add_rule key="identity" list=4 res=1`,
    },
  ],
  admin: [
    {
      source: "kernel",
      level: "notice",
      createMessage: () => `iptables: ACCEPT IN=eth0 OUT= MAC=52:54:00:12:34:56 SRC=${rand(IPS)} DST=10.0.0.1 PROTO=TCP SPT=443 DPT=${randInt(1024, 65535)}`,
    },
    {
      source: "systemd",
      level: "info",
      createMessage: () => `Started SakshiLog Integrity Daemon (sakshilog-agent.service).`,
    },
    {
      source: "usermod",
      level: "notice",
      createMessage: () => `add '${rand(REALISTIC_USERS)}' to group 'sudo'`,
    },
  ],
};

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateRandomAction(type?: string): AppendOptions {
  const category = type && ACTION_TEMPLATES[type] ? type : rand(Object.keys(ACTION_TEMPLATES));
  const tpl = rand(ACTION_TEMPLATES[category]);
  return {
    source: tpl.source,
    level: tpl.level,
    message: tpl.createMessage(),
    host: "victim-01",
  };
}

export class LoadGenerator {
  private running = false;
  private intervalTimer: NodeJS.Timeout | null = null;
  private rate = 10; // logs per second (default 10, up to 1000)
  private totalGenerated = 0;
  private startTime = 0;
  private readonly chain: HashChain;

  constructor(chain: HashChain) {
    this.chain = chain;
  }

  start(targetRate = 50): void {
    if (this.running) {
      this.setRate(targetRate);
      return;
    }

    this.running = true;
    this.rate = Math.max(1, Math.min(1000, targetRate));
    this.startTime = Date.now();
    this.totalGenerated = 0;

    // Tick every 100ms for smooth load generation
    const tickIntervalMs = 100;
    const logsPerTick = Math.max(1, Math.round((this.rate * tickIntervalMs) / 1000));

    this.intervalTimer = setInterval(() => {
      if (!this.running) return;

      const items: AppendOptions[] = [];
      for (let i = 0; i < logsPerTick; i++) {
        items.push(generateRandomAction());
      }
      this.chain.appendBulk(items);
      this.totalGenerated += items.length;
    }, tickIntervalMs);

    console.log(`[LoadGenerator] Started at target rate: ${this.rate} logs/sec`);
  }

  setRate(rate: number): void {
    const clamped = Math.max(1, Math.min(1000, rate));
    this.rate = clamped;
    if (this.running) {
      this.stop();
      this.start(clamped);
    }
  }

  stop(): void {
    this.running = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    console.log(`[LoadGenerator] Stopped. Total generated: ${this.totalGenerated} logs.`);
  }

  getStats(): { isRunning: boolean; targetRate: number; totalGenerated: number; elapsedSec: number; actualLps: number } {
    const elapsedSec = this.running ? (Date.now() - this.startTime) / 1000 : 0;
    const actualLps = elapsedSec > 0 ? Math.round(this.totalGenerated / elapsedSec) : 0;
    return {
      isRunning: this.running,
      targetRate: this.rate,
      totalGenerated: this.totalGenerated,
      elapsedSec: Math.round(elapsedSec),
      actualLps,
    };
  }
}
