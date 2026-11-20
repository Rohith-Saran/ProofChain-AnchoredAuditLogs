/**
 * Adaptive anchoring (Phase 4a, M1): a lightweight, rule-based risk scorer over the live
 * log stream. No ML model, no network call — just weighted pattern matches on a sliding
 * window, which is enough to notice a brute-force login burst, a new sudo-group member,
 * or odd-hour activity and react within one tick. Deliberately simple per the plan ("Simple
 * scoring or an isolation forest both work") so it's auditable and has zero failure modes
 * of its own to degrade the pipeline.
 *
 * Pure and framework-agnostic: used live by anchorServiceConnector.ts, and reused as-is by
 * bench/src/exposureWindow.ts to simulate the same scoring against a synthetic timeline.
 */
import type { LogEntry } from "./types.ts";

export interface RiskConfig {
  /** Anchor interval at risk score 0 (quiet). Default 5000ms, matching the plan's "5s normal". */
  maxIntervalMs?: number;
  /** Anchor interval once risk saturates. Default 1000ms, matching the plan's "1s under risk". */
  minIntervalMs?: number;
  /** Sliding window for burst counting; events older than this age out. Default 10s. */
  windowMs?: number;
  /** Risk score (sum of in-window event weights) at which the interval bottoms out at minIntervalMs. */
  saturation?: number;
}

export interface RiskState {
  /** 0..1, 0 = no recent suspicious activity, 1+ (clamped to 1) = saturated. */
  score: number;
  anchorIntervalMs: number;
  reason: string;
  updatedAt: number;
}

interface RiskEvent {
  ts: number;
  weight: number;
  tag: "failed-login" | "sudo-failure" | "new-sudo-user" | "odd-hour";
}

/** How much shorter the new target interval must be than the time left on the current
 *  wait before it's worth cutting that wait short. Shared with bench/src/exposureWindow.ts
 *  so its discrete-event replica reschedules on exactly the same rule as the live agent. */
export const RESCHEDULE_EPSILON_MS = 100;

const FAILED_LOGIN_RE = /Failed password|authentication failure|invalid user|pam_authenticate failure|FAILED LOGIN/i;
const SUDO_FAILURE_RE = /incorrect password attempt|sudo.*authentication failure/i;
const NEW_SUDO_USER_RE = /add '.+' to group '(sudo|wheel)'|added to group '(sudo|wheel)'|usermod -aG (sudo|wheel)|NOPASSWD/i;

const DEFAULT_CONFIG: Required<RiskConfig> = {
  maxIntervalMs: 5000,
  minIntervalMs: 1000,
  windowMs: 10_000,
  saturation: 1.0,
};

/** Pure mapping from a risk score to the anchor interval it drives. Shared by the live
 *  scorer and the benchmark so both pick the exact same interval for the same score.
 *  Supports continuous linear interpolation (default) or stepped threshold reduction. */
export function computeIntervalForScore(
  score: number,
  cfg: Required<RiskConfig> = DEFAULT_CONFIG,
  stepThresholds = false
): number {
  const t = Math.max(0, Math.min(1, score / cfg.saturation));
  if (stepThresholds) {
    if (t >= 0.8) return cfg.minIntervalMs; // 1000ms
    if (t >= 0.6) return Math.round(cfg.minIntervalMs + 0.25 * (cfg.maxIntervalMs - cfg.minIntervalMs)); // 2000ms
    if (t >= 0.4) return Math.round(cfg.minIntervalMs + 0.50 * (cfg.maxIntervalMs - cfg.minIntervalMs)); // 3000ms
    if (t >= 0.2) return Math.round(cfg.minIntervalMs + 0.75 * (cfg.maxIntervalMs - cfg.minIntervalMs)); // 4000ms
    return cfg.maxIntervalMs; // 5000ms
  }
  const interval = cfg.maxIntervalMs - t * (cfg.maxIntervalMs - cfg.minIntervalMs);
  return Math.round(interval);
}

function classify(entry: Pick<LogEntry, "message" | "ts">): { weight: number; tag: RiskEvent["tag"] } | null {
  if (FAILED_LOGIN_RE.test(entry.message)) return { weight: 0.28, tag: "failed-login" };
  if (SUDO_FAILURE_RE.test(entry.message)) return { weight: 0.22, tag: "sudo-failure" };
  if (NEW_SUDO_USER_RE.test(entry.message)) return { weight: 0.55, tag: "new-sudo-user" };

  const hour = new Date(entry.ts).getUTCHours();
  if (hour < 5 || hour >= 23) return { weight: 0.1, tag: "odd-hour" };

  return null;
}

const REASON_LABEL: Record<RiskEvent["tag"], (n: number, windowSec: number) => string> = {
  "failed-login": (n, w) => `${n} failed login${n === 1 ? "" : "s"} in last ${w}s`,
  "sudo-failure": (n, w) => `${n} sudo auth failure${n === 1 ? "" : "s"} in last ${w}s`,
  "new-sudo-user": (n) => `new sudo-group member detected${n > 1 ? ` (x${n})` : ""}`,
  "odd-hour": () => `activity during odd hours`,
};

export class RiskScorer {
  private readonly cfg: Required<RiskConfig>;
  private events: RiskEvent[] = [];
  private lastScore = 0;

  constructor(cfg: RiskConfig = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };
  }

  /** Feed newly-written entries in; returns the freshly recomputed risk state. */
  observe(entries: LogEntry[], nowMs = Date.now()): RiskState {
    for (const entry of entries) {
      const hit = classify(entry);
      if (hit) this.events.push({ ts: entry.ts, weight: hit.weight, tag: hit.tag });
    }
    return this.recompute(nowMs);
  }

  /** Re-evaluate the sliding window without new entries (the window itself decays the score
   *  back down once a burst ages out — no separate decay curve needed). */
  recompute(nowMs = Date.now()): RiskState {
    this.events = this.events.filter((ev) => nowMs - ev.ts <= this.cfg.windowMs);

    const score = Math.min(1, this.events.reduce((sum, ev) => sum + ev.weight, 0));
    this.lastScore = score;

    const counts = new Map<RiskEvent["tag"], number>();
    for (const ev of this.events) counts.set(ev.tag, (counts.get(ev.tag) ?? 0) + 1);

    const windowSec = Math.round(this.cfg.windowMs / 1000);
    // Report the strongest signals first; odd-hour alone is the weakest and only shown
    // when nothing sharper is in the window.
    const order: RiskEvent["tag"][] = ["new-sudo-user", "failed-login", "sudo-failure", "odd-hour"];
    const parts = order
      .filter((tag) => counts.has(tag))
      .map((tag) => REASON_LABEL[tag](counts.get(tag)!, windowSec));

    return {
      score: Math.round(score * 1000) / 1000,
      anchorIntervalMs: computeIntervalForScore(score, this.cfg),
      reason: parts.length > 0 ? parts.join(", ") : "no recent activity",
      updatedAt: nowMs,
    };
  }

  getScore(): number {
    return this.lastScore;
  }
}
