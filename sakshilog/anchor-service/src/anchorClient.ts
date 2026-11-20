/**
 * anchorClient: a thin, typed wrapper around the AnchorRegistry contract.
 *
 * Used by: anchor-service (writes), verifier / evidence / dashboard (reads).
 *
 *   const client = AnchorClient.fromEnv();          // reads contracts/deployments/localhost.json
 *   const b = await client.anchor({ batchId: 0, merkleRoot, lastChainHash, startSeq: 1, endSeq: 100 });
 *   const same = await client.getBatch(0);          // includes txHash + blockNumber
 *
 * Env vars (all optional):
 *   CHAIN_RPC_URL    default http://127.0.0.1:8545
 *   ANCHORER_KEY     private key for writes; default is Hardhat dev account #0 (local only!)
 *   DEPLOYMENT_FILE  default ../contracts/deployments/localhost.json
 */
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------- types (INTERFACES.md)

/** Batch as defined in INTERFACES.md, plus on-chain timestamp. */
export interface Batch {
  batchId: number;
  startSeq: number;
  endSeq: number;
  merkleRoot: string; // 0x-prefixed bytes32, lowercase
  lastChainHash: string; // 0x-prefixed bytes32, lowercase
  txHash: string | null; // null only if the Anchored event could not be found
  blockNumber: number;
  timestamp: number; // unix seconds (block.timestamp)
}

export interface AnchorInput {
  batchId: number;
  merkleRoot: string; // 64 hex chars, with or without 0x
  lastChainHash: string; // 64 hex chars, with or without 0x
  startSeq: number;
  endSeq: number; // heartbeat (no new logs): endSeq = startSeq - 1
}

export interface AnchorResult extends Batch {
  gasUsed: bigint;
  latencyMs: number; // submit -> mined
}

export interface Deployment {
  contract: string;
  network: string;
  chainId: number;
  address: string;
  anchorer: string;
  deployBlock: number;
  abi: ethers.InterfaceAbi;
}

/** Contract revert decoded into a named error, e.g. BadBatchId { expected, got }. */
export class AnchorError extends Error {
  constructor(
    public readonly reason: "NotAnchorer" | "BadBatchId" | "InvalidRange" | "BatchNotFound" | string,
    public readonly args: Record<string, unknown>,
    cause?: unknown,
  ) {
    super(`AnchorRegistry reverted: ${reason} ${JSON.stringify(args, bigintReplacer)}`);
    this.name = "AnchorError";
    if (cause) (this as { cause?: unknown }).cause = cause;
  }
}

// ---------------------------------------------------------------- helpers

/** Hardhat's well-known dev account #0. Public knowledge; never use off a local chain. */
export const HARDHAT_DEV_KEY_0 =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const DEFAULT_DEPLOYMENT_FILE = path.resolve(
  __dirname,
  "..",
  "..",
  "contracts",
  "deployments",
  "localhost.json",
);

/** Normalise a sha256 hex string (with or without 0x) to a 0x-prefixed lowercase bytes32. */
export function toBytes32(hex: string): string {
  const h = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]{64}$/.test(h)) {
    throw new Error(`expected 32-byte hex (64 chars), got "${hex}"`);
  }
  return "0x" + h.toLowerCase();
}

export const ZERO_HASH = ethers.ZeroHash;

export function loadDeployment(file = process.env.DEPLOYMENT_FILE ?? DEFAULT_DEPLOYMENT_FILE): Deployment {
  if (!fs.existsSync(file)) {
    throw new Error(
      `Deployment file not found: ${file}\n` +
        `Start the chain (cd contracts && npm run node) and deploy (npm run deploy:local) first.`,
    );
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as Deployment;
}

function bigintReplacer(_k: string, v: unknown) {
  return typeof v === "bigint" ? v.toString() : v;
}

function assertSeq(name: string, v: number) {
  if (!Number.isSafeInteger(v) || v < 0) throw new Error(`${name} must be a non-negative integer, got ${v}`);
}

// ---------------------------------------------------------------- client

export interface AnchorClientOptions {
  deployment: Deployment;
  rpcUrl?: string;
  /** Omit for a read-only client (verifier, dashboard). */
  privateKey?: string;
  /** How often ethers polls for new blocks/events. Default 1000 ms (local chain). */
  pollingIntervalMs?: number;
}

export class AnchorClient {
  readonly provider: ethers.JsonRpcProvider;
  readonly contract: ethers.Contract;
  readonly deployment: Deployment;
  readonly signer?: ethers.Wallet;
  /** Serialises anchor() calls so concurrent callers never race on the nonce. */
  private queue: Promise<unknown> = Promise.resolve();
  /**
   * Locally tracked nonce. ethers v6 caches identical RPC calls for ~250 ms, so
   * back-to-back txs can be handed a stale nonce. Calls are serialised, so we own
   * the counter and re-sync from the chain after any failure.
   */
  private nextNonce: number | null = null;

  constructor(opts: AnchorClientOptions) {
    this.deployment = opts.deployment;
    const network = ethers.Network.from(opts.deployment.chainId);
    this.provider = new ethers.JsonRpcProvider(opts.rpcUrl ?? "http://127.0.0.1:8545", network, {
      staticNetwork: network,
      pollingInterval: opts.pollingIntervalMs ?? 1000,
    });
    if (opts.privateKey) this.signer = new ethers.Wallet(opts.privateKey, this.provider);
    this.contract = new ethers.Contract(
      opts.deployment.address,
      opts.deployment.abi,
      this.signer ?? this.provider,
    );
  }

  /** Build from env vars + deployment file. Pass readOnly=true for verifier/dashboard. */
  static fromEnv(opts: { readOnly?: boolean } = {}): AnchorClient {
    return new AnchorClient({
      deployment: loadDeployment(),
      rpcUrl: process.env.CHAIN_RPC_URL,
      privateKey: opts.readOnly ? undefined : (process.env.ANCHORER_KEY ?? HARDHAT_DEV_KEY_0),
    });
  }

  get address(): string {
    return this.deployment.address;
  }

  // ---------------------------------------------------------------- writes

  /**
   * Anchor one batch and wait until it is mined.
   * Throws AnchorError("BadBatchId", { expected, got }) if batchId != nextBatchId:
   * the caller should re-read nextBatchId() and resync.
   */
  anchor(input: AnchorInput): Promise<AnchorResult> {
    const run = () => this.anchorNow(input);
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  private async anchorNow(input: AnchorInput): Promise<AnchorResult> {
    if (!this.signer) throw new Error("AnchorClient is read-only (no private key)");
    assertSeq("batchId", input.batchId);
    assertSeq("startSeq", input.startSeq);
    assertSeq("endSeq", input.endSeq);
    const merkleRoot = toBytes32(input.merkleRoot);
    const lastChainHash = toBytes32(input.lastChainHash);

    const t0 = Date.now();
    let receipt: ethers.TransactionReceipt | null;
    try {
      if (this.nextNonce === null) {
        this.nextNonce = await this.provider.getTransactionCount(this.signer.address, "pending");
      }
      const tx: ethers.ContractTransactionResponse = await this.contract.anchor(
        input.batchId,
        merkleRoot,
        lastChainHash,
        input.startSeq,
        input.endSeq,
        { nonce: this.nextNonce },
      );
      this.nextNonce++;
      receipt = await tx.wait();
    } catch (err) {
      this.nextNonce = null; // re-sync from chain on next call
      throw this.decodeError(err);
    }
    if (!receipt || receipt.status !== 1) throw new Error(`anchor tx failed: ${receipt?.hash}`);
    const latencyMs = Date.now() - t0;

    const ev = receipt.logs
      .map((l) => {
        try {
          return this.contract.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((e) => e?.name === "Anchored");
    if (!ev) throw new Error(`Anchored event missing in tx ${receipt.hash}`);

    return {
      batchId: Number(ev.args.batchId),
      startSeq: Number(ev.args.startSeq),
      endSeq: Number(ev.args.endSeq),
      merkleRoot: ev.args.merkleRoot,
      lastChainHash: ev.args.lastChainHash,
      timestamp: Number(ev.args.timestamp),
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      latencyMs,
    };
  }

  // ---------------------------------------------------------------- reads

  async nextBatchId(): Promise<number> {
    return Number(await this.contract.nextBatchId());
  }

  /** Returns the batch with its txHash, or null if batchId has not been anchored yet. */
  async getBatch(batchId: number): Promise<Batch | null> {
    assertSeq("batchId", batchId);
    let raw: ethers.Result;
    try {
      raw = await this.contract.getBatch(batchId);
    } catch (err) {
      const e = this.decodeError(err);
      if (e instanceof AnchorError && e.reason === "BatchNotFound") return null;
      throw e;
    }
    const events = await this.contract.queryFilter(
      this.contract.filters.Anchored(batchId),
      this.deployment.deployBlock,
    );
    return {
      batchId: Number(raw.batchId),
      startSeq: Number(raw.startSeq),
      endSeq: Number(raw.endSeq),
      merkleRoot: raw.merkleRoot,
      lastChainHash: raw.lastChainHash,
      timestamp: Number(raw.timestamp),
      blockNumber: Number(raw.blockNumber),
      txHash: events[0]?.transactionHash ?? null,
    };
  }

  /** All anchored batches (from events), oldest first. One RPC call; use this in the verifier. */
  async getAllBatches(fromBatchId = 0): Promise<Batch[]> {
    const events = await this.contract.queryFilter(
      this.contract.filters.Anchored(),
      this.deployment.deployBlock,
    );
    return events
      .filter((e): e is ethers.EventLog => "args" in e)
      .map((e) => this.eventToBatch(e))
      .filter((b) => b.batchId >= fromBatchId)
      .sort((a, b) => a.batchId - b.batchId);
  }

  /** Subscribe to new anchors (dashboard / silence detector). Returns an unsubscribe function. */
  onAnchored(cb: (batch: Batch) => void): () => void {
    const listener = (...args: unknown[]) => {
      const payload = args[args.length - 1] as ethers.ContractEventPayload;
      cb(this.eventToBatch(payload.log));
    };
    void this.contract.on("Anchored", listener);
    return () => void this.contract.off("Anchored", listener);
  }

  async close(): Promise<void> {
    await this.contract.removeAllListeners();
    this.provider.destroy();
  }

  // ---------------------------------------------------------------- internals

  private eventToBatch(e: ethers.EventLog): Batch {
    return {
      batchId: Number(e.args.batchId),
      startSeq: Number(e.args.startSeq),
      endSeq: Number(e.args.endSeq),
      merkleRoot: e.args.merkleRoot,
      lastChainHash: e.args.lastChainHash,
      timestamp: Number(e.args.timestamp),
      txHash: e.transactionHash,
      blockNumber: e.blockNumber,
    };
  }

  /** Turn an ethers CALL_EXCEPTION carrying custom-error data into an AnchorError. */
  private decodeError(err: unknown): unknown {
    const e = err as { data?: string; revert?: { name: string; args: ethers.Result }; info?: { error?: { data?: string } } };
    let name: string | undefined = e?.revert?.name;
    let args: ethers.Result | undefined = e?.revert?.args;
    if (!name) {
      const data = e?.data ?? e?.info?.error?.data;
      if (typeof data === "string" && data.length >= 10) {
        try {
          const parsed = this.contract.interface.parseError(data);
          if (parsed) {
            name = parsed.name;
            args = parsed.args;
          }
        } catch {
          /* not one of ours */
        }
      }
    }
    if (!name) return err;
    const frag = this.contract.interface.getError(name);
    const named: Record<string, unknown> = {};
    frag?.inputs.forEach((input, i) => {
      const v = args?.[i];
      named[input.name || String(i)] = typeof v === "bigint" && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v;
    });
    return new AnchorError(name, named, err);
  }
}
