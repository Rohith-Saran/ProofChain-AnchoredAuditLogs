/**
 * End-to-end smoke test against a running local chain:
 *   1. anchor a batch, read it back with getBatch()
 *   2. anchor a heartbeat (empty range)
 *   3. attack 8: try to overwrite an old batch      -> must be rejected (BadBatchId)
 *   4. try to skip a batch id                       -> must be rejected (BadBatchId)
 *   5. try to anchor from a non-anchorer key        -> must be rejected (NotAnchorer)
 *
 * Run (with `npm run node` + `npm run deploy:local` in contracts/ first):
 *   npm run smoke
 * Safe to rerun: it always continues from the chain's current nextBatchId.
 */
import { createHash } from "crypto";
import { AnchorClient, AnchorError, loadDeployment, ZERO_HASH } from "./anchorClient";

// Hardhat dev account #2: not an anchorer in the default deployment.
const NON_ANCHORER_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function expectReject(label: string, reason: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof AnchorError && e.reason === reason) {
      console.log(`  PASS  ${label}: rejected with ${e.reason} ${JSON.stringify(e.args)}`);
      return;
    }
    throw new Error(`${label}: expected ${reason}, got ${(e as Error).message}`);
  }
  throw new Error(`${label}: expected ${reason}, but the tx succeeded`);
}

async function main() {
  const client = AnchorClient.fromEnv();
  console.log(`AnchorRegistry at ${client.address} (chainId ${client.deployment.chainId})`);

  const start = await client.nextBatchId();
  const prev = start > 0 ? await client.getBatch(start - 1) : null;
  const startSeq = prev ? prev.endSeq + 1 : 1;

  // Placeholder batch: 50 fake chained entries. The root here is a stand-in hash;
  // the real Merkle root comes from M3's Merkle library.
  let prevHash = prev ? prev.lastChainHash.slice(2) : "0".repeat(64);
  const hashes: string[] = [];
  for (let seq = startSeq; seq < startSeq + 50; seq++) {
    prevHash = sha256(`${seq}|${Date.now()}|victim-01|auth|login ok user=demo|${prevHash}`);
    hashes.push(prevHash);
  }
  const fakeRoot = sha256(hashes.join(""));
  const endSeq = startSeq + hashes.length - 1;

  // 1. anchor + read back
  const a = await client.anchor({ batchId: start, merkleRoot: fakeRoot, lastChainHash: prevHash, startSeq, endSeq });
  console.log(
    `  PASS  anchored batch ${a.batchId} seq ${a.startSeq}..${a.endSeq}  block ${a.blockNumber}  ` +
      `gas ${a.gasUsed}  ${a.latencyMs} ms  tx ${a.txHash}`,
  );
  const b = await client.getBatch(start);
  if (!b || b.merkleRoot !== a.merkleRoot || b.lastChainHash !== a.lastChainHash || b.txHash !== a.txHash) {
    throw new Error(`getBatch(${start}) mismatch: ${JSON.stringify(b)}`);
  }
  console.log(`  PASS  getBatch(${start}) matches, txHash ${b.txHash}`);

  // 2. heartbeat
  const hb = await client.anchor({
    batchId: start + 1,
    merkleRoot: ZERO_HASH,
    lastChainHash: prevHash,
    startSeq: endSeq + 1,
    endSeq,
  });
  console.log(`  PASS  heartbeat batch ${hb.batchId} (empty range ${hb.startSeq}..${hb.endSeq}) gas ${hb.gasUsed}`);

  // 3. attack 8: overwrite an old batch with a stolen key
  await expectReject("overwrite old batch", "BadBatchId", () =>
    client.anchor({ batchId: start, merkleRoot: sha256("forged"), lastChainHash: sha256("forged"), startSeq, endSeq }),
  );
  const after = await client.getBatch(start);
  if (after?.merkleRoot !== a.merkleRoot) throw new Error("batch changed after overwrite attempt!");
  console.log(`  PASS  batch ${start} unchanged after overwrite attempt`);

  // 4. skip ahead
  await expectReject("skip batch id", "BadBatchId", () =>
    client.anchor({ batchId: start + 5, merkleRoot: fakeRoot, lastChainHash: prevHash, startSeq: endSeq + 1, endSeq: endSeq + 10 }),
  );

  // 5. non-anchorer
  const outsider = new AnchorClient({
    deployment: loadDeployment(),
    rpcUrl: process.env.CHAIN_RPC_URL,
    privateKey: NON_ANCHORER_KEY,
  });
  await expectReject("non-anchorer", "NotAnchorer", () =>
    outsider.anchor({ batchId: start + 2, merkleRoot: fakeRoot, lastChainHash: prevHash, startSeq: endSeq + 1, endSeq: endSeq + 10 }),
  );

  const all = await client.getAllBatches();
  console.log(`  PASS  getAllBatches(): ${all.length} batches on chain, nextBatchId ${await client.nextBatchId()}`);
  console.log("SMOKE OK");

  await outsider.close();
  await client.close();
}

main().catch((err) => {
  console.error("SMOKE FAILED:", err);
  process.exitCode = 1;
});
