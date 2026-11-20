/**
 * Attack 8: steal the anchoring key and try to overwrite an old batch.
 * Usage: node --experimental-strip-types src/08-steal-key-overwrite.ts [batchIdToOverwrite]
 *
 * In this local demo the "stolen" key is simply the known anchorer key (the same one
 * anchor-service/anchorClient.ts uses for real anchors) — the point is that possessing
 * the legitimate key is *still not enough* to rewrite history: AnchorRegistry.anchor()
 * only ever accepts batchId == nextBatchId. This script proves the contract rejects the
 * overwrite and that the original batch is untouched.
 */
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { banner, log } from "./common.ts";

const targetBatchId = process.argv[2] ? Number(process.argv[2]) : undefined;

async function main() {
  banner("ATTACK 8: Steal the anchor key, try to overwrite an old batch");

  const anchorClientPath = path.resolve(import.meta.dirname, "../../anchor-service/src/anchorClient.ts");
  const mod = await import(pathToFileURL(anchorClientPath).href);
  const { AnchorClient, AnchorError } = mod;

  const client = AnchorClient.fromEnv(); // writer: uses the (stolen) anchorer key
  const nextId = await client.nextBatchId();

  if (nextId === 0) {
    log("No batches anchored yet — nothing to overwrite. Let the agent anchor at least one batch first.");
    process.exitCode = 1;
    await client.close();
    return;
  }

  const victimBatchId = targetBatchId ?? 0;
  const before = await client.getBatch(victimBatchId);
  log(`Target: batch ${victimBatchId} (currently merkleRoot ${before?.merkleRoot?.slice(0, 12)}...)`);
  log(`Attempting anchor(batchId=${victimBatchId}, ...) with a forged root, using the real anchorer key...`);

  try {
    await client.anchor({
      batchId: victimBatchId,
      merkleRoot: "ff".repeat(32),
      lastChainHash: "ee".repeat(32),
      startSeq: 999999,
      endSeq: 999999,
    });
    log("UNEXPECTED: the overwrite succeeded! This would be a critical contract bug.");
    process.exitCode = 1;
  } catch (err: unknown) {
    if (err instanceof AnchorError && err.reason === "BadBatchId") {
      log(`PASS — rejected by the contract: ${err.message}`);
      log(`Expected next batchId was ${nextId}; batch ${victimBatchId} can only ever be written once.`);
    } else {
      log(`Rejected, but not the expected reason: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  }

  const after = await client.getBatch(victimBatchId);
  const untouched = before && after && before.merkleRoot === after.merkleRoot && before.lastChainHash === after.lastChainHash;
  log(untouched ? "PASS — batch is byte-for-byte unchanged after the overwrite attempt." : "FAIL — the batch changed!");
  if (!untouched) process.exitCode = 1;

  log("Expected: n/a for a plain hash chain (no concept of batches) | SakshiLog: Rejected by contract, history unchanged");
  await client.close();
}

main().catch((err) => {
  console.error("Attack 8 script error:", err);
  process.exitCode = 1;
});
