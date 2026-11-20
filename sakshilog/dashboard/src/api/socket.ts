import { io, Socket } from "socket.io-client";
import type { LogEntry, Batch, VerificationResult, ConnectionStatus } from "../types";
import { isMockMode } from "./client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://127.0.0.1:4001";

type Listener<T> = (data: T) => void;

class RealtimeManager {
  private socket: Socket | null = null;
  private statusListeners: Set<Listener<ConnectionStatus>> = new Set();
  private logListeners: Set<Listener<LogEntry>> = new Set();
  private batchListeners: Set<Listener<Batch>> = new Set();
  private verdictListeners: Set<Listener<VerificationResult>> = new Set();
  private silenceListeners: Set<Listener<boolean>> = new Set();
  private currentStatus: ConnectionStatus = "disconnected";
  private mockInterval: number | null = null;
  private mockSeq = 107;

  constructor() {
    this.init();
  }

  public init() {
    if (isMockMode()) {
      this.setStatus("mock");
      this.startMockSimulation();
      return;
    }

    try {
      this.socket = io(SOCKET_URL, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        timeout: 5000,
      });

      this.socket.on("connect", () => {
        this.setStatus("connected");
      });

      this.socket.on("reconnect_attempt", () => {
        this.setStatus("reconnecting");
      });

      this.socket.on("disconnect", () => {
        this.setStatus("reconnecting");
      });

      this.socket.on("connect_error", () => {
        // Fall back gracefully to mock/polling without crashing
        this.setStatus("mock");
        this.startMockSimulation();
      });

      this.socket.on("log", (log: LogEntry) => {
        this.logListeners.forEach((fn) => fn(log));
      });

      this.socket.on("batch", (batch: Batch) => {
        this.batchListeners.forEach((fn) => fn(batch));
      });

      this.socket.on("verdict", (v: VerificationResult) => {
        this.verdictListeners.forEach((fn) => fn(v));
      });

      this.socket.on("silence", (isSilent: boolean) => {
        this.silenceListeners.forEach((fn) => fn(isSilent));
      });
    } catch {
      this.setStatus("mock");
      this.startMockSimulation();
    }
  }

  private setStatus(status: ConnectionStatus) {
    this.currentStatus = status;
    this.statusListeners.forEach((fn) => fn(status));
  }

  public getStatus(): ConnectionStatus {
    return this.currentStatus;
  }

  public onStatusChange(fn: Listener<ConnectionStatus>): () => void {
    this.statusListeners.add(fn);
    fn(this.currentStatus);
    return () => this.statusListeners.delete(fn);
  }

  public onLog(fn: Listener<LogEntry>): () => void {
    this.logListeners.add(fn);
    return () => this.logListeners.delete(fn);
  }

  public onBatch(fn: Listener<Batch>): () => void {
    this.batchListeners.add(fn);
    return () => this.batchListeners.delete(fn);
  }

  public onVerdict(fn: Listener<VerificationResult>): () => void {
    this.verdictListeners.add(fn);
    return () => this.verdictListeners.delete(fn);
  }

  public onSilence(fn: Listener<boolean>): () => void {
    this.silenceListeners.add(fn);
    return () => this.silenceListeners.delete(fn);
  }

  public startMockSimulation() {
    if (this.mockInterval) return;

    this.mockInterval = window.setInterval(() => {
      if (this.currentStatus !== "mock") return;

      const newLog: LogEntry = {
        seq: this.mockSeq++,
        ts: Date.now(),
        host: "victim-server",
        source: Math.random() > 0.5 ? "sshd" : "kernel",
        level: "info",
        message: `Heartbeat health check ping event id=${Math.floor(Math.random() * 1000)}`,
        prevHash: `0x${Math.random().toString(16).substring(2, 10)}…${Math.random().toString(16).substring(2, 6)}`,
        hash: `0x${Math.random().toString(16).substring(2, 10)}…${Math.random().toString(16).substring(2, 6)}`
      };

      this.logListeners.forEach((fn) => fn(newLog));

      // Emit new batch anchor periodically
      if (this.mockSeq % 10 === 0) {
        const batch: Batch = {
          batchId: Math.floor(this.mockSeq / 10),
          startSeq: this.mockSeq - 10,
          endSeq: this.mockSeq - 1,
          merkleRoot: `0x${Math.random().toString(16).slice(2, 10)}…48fe02`,
          lastChainHash: newLog.hash,
          txHash: `0x${Math.random().toString(16).slice(2, 12)}…${Math.random().toString(16).slice(2, 6)}`,
          blockNumber: 42109 + Math.floor(this.mockSeq / 10),
          timestamp: Date.now()
        };
        this.batchListeners.forEach((fn) => fn(batch));
      }
    }, 4000);
  }

  public stopMockSimulation() {
    if (this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = null;
    }
  }

  public emitMockState(logs: LogEntry[], batches: Batch[], verif: VerificationResult) {
    logs.forEach((l) => this.logListeners.forEach((fn) => fn(l)));
    batches.forEach((b) => this.batchListeners.forEach((fn) => fn(b)));
    this.verdictListeners.forEach((fn) => fn(verif));
  }
}

export const realtime = new RealtimeManager();
