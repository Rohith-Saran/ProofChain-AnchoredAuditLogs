import { AgentDB } from "./src/db.ts";
import { HashChain, computeEntryHash } from "./src/hashChain.ts";
import { MerkleTree } from "./src/merkle.ts";
import { CollectorDB } from "../collector/src/db.ts";
import { generateRandomAction, LoadGenerator } from "./src/loadGenerator.ts";
import { exportEvidencePack } from "../evidence/src/exportPack.ts";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
}

async function runTests() {
  console.log("==================================================================");
  console.log("           SakshiLog M2 (Backend / Log Pipeline) Tests            ");
  console.log("==================================================================");

  const testDir = path.resolve(import.meta.dirname, "../../tmp-test-m2");
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  const victimDbPath = path.join(testDir, "victim.db");
  const collectorDbPath = path.join(testDir, "collector.db");

  // 1. Test AgentDB & HashChain
  console.log("\n[Test 1] SQLite DB & Hash Chaining");
  const agentDb = new AgentDB(victimDbPath);
  const collectorDb = new CollectorDB(collectorDbPath);

  // Directly forward to collector for synchronous test
  const chain = new HashChain(agentDb, undefined, "victim-server");

  // Write realistic actions
  const action1 = chain.append({
    source: "auth",
    level: "info",
    message: "Accepted publickey for admin from 192.168.1.15 port 54321 ssh2",
  });
  assert(action1.seq === 1, "First entry must have seq = 1");
  assert(action1.prevHash === "0".repeat(64), "Genesis prevHash must be 64 zeros");
  assert(
    action1.hash === computeEntryHash(action1),
    "Entry hash must strictly match sha256(seq|ts|host|source|message|prevHash)"
  );
  console.log(`  ✓ Genesis entry seq ${action1.seq} hash verified: ${action1.hash.slice(0, 16)}...`);

  // Write second action (sudo)
  const action2 = chain.append({
    source: "sudo",
    level: "notice",
    message: "admin : TTY=pts/1 ; PWD=/home ; USER=root ; COMMAND=/usr/bin/apt-get update",
  });
  assert(action2.seq === 2, "Second entry must have seq = 2");
  assert(action2.prevHash === action1.hash, "Second entry prevHash must equal first entry hash");
  assert(action2.hash === computeEntryHash(action2), "Second entry hash matches formula");
  console.log(`  ✓ Linked entry seq ${action2.seq} correctly chained to prevHash: ${action2.prevHash.slice(0, 16)}...`);

  // Write 48 more actions using generator
  for (let i = 0; i < 48; i++) {
    const act = generateRandomAction();
    chain.append(act);
  }
  assert(agentDb.getStats().totalLogs === 50, "Total logs in SQLite must be 50");
  console.log(`  ✓ Generated 50 realistic chained entries (logins, sudo, file access, admin actions)`);

  // 2. Test Merkle Tree & Proofs
  console.log("\n[Test 2] Merkle Tree & Inclusion Proofs");
  const unanchored = agentDb.getUnanchoredEntries(100);
  assert(unanchored.length === 50, "Should have 50 unanchored entries");

  const leafHashes = unanchored.map((e) => e.hash);
  const tree = new MerkleTree(leafHashes);
  assert(tree.root.length === 64, "Merkle root must be 64-char hex");
  console.log(`  ✓ Merkle root computed for 50 leaves: ${tree.rootWith0x}`);

  // Test proof verification for every single leaf
  for (let idx = 0; idx < leafHashes.length; idx++) {
    const proof = tree.getProof(idx);
    const valid = MerkleTree.verifyProof(leafHashes[idx], proof, tree.root);
    assert(valid, `Merkle proof for leaf ${idx} must verify against root`);
  }
  console.log(`  ✓ All 50 Merkle inclusion proofs verified successfully`);

  // Test odd number of leaves
  const oddTree = new MerkleTree(["a".repeat(64), "b".repeat(64), "c".repeat(64)]);
  for (let i = 0; i < 3; i++) {
    const p = oddTree.getProof(i);
    assert(MerkleTree.verifyProof(oddTree.leaves[i], p, oddTree.root), `Odd tree proof ${i} verified`);
  }
  console.log(`  ✓ Odd-leaf count Merkle balancing and proofs verified`);

  // 3. Test Collector & Off-Host Copy
  console.log("\n[Test 3] Off-Host Collector Mirroring");
  collectorDb.ingestBatch(unanchored);
  assert(collectorDb.getStats().totalLogs === 50, "Collector must hold 50 entries");

  for (let seq = 1; seq <= 50; seq++) {
    const vEntry = agentDb.getEntryBySeq(seq)!;
    const cEntry = collectorDb.getEntry(seq)!;
    assert(vEntry.hash === cEntry.hash, `Seq ${seq} hash must match between victim and collector`);
    assert(vEntry.message === cEntry.message, `Seq ${seq} message must match between victim and collector`);
  }
  console.log(`  ✓ Off-host collector copy matches victim logs 100%`);

  // 4. Test Batching & Anchoring Assignment
  console.log("\n[Test 4] Batch Recording & BatchId Mapping");
  agentDb.markAnchored(1, 50, 0);
  collectorDb.recordBatch({
    batchId: 0,
    startSeq: 1,
    endSeq: 50,
    merkleRoot: tree.rootWith0x,
    lastChainHash: "0x" + unanchored[49].hash,
    txHash: "0x" + "f".repeat(64),
    blockNumber: 42,
    timestamp: Math.floor(Date.now() / 1000),
  });

  const updatedStats = agentDb.getStats();
  assert(updatedStats.unanchoredLogs === 0, "All logs should now be anchored");
  console.log(`  ✓ Batch 0 recorded; unanchored count is now 0`);

  // 5. Test Load Generator
  console.log("\n[Test 5] Load Generator Throughput");
  const loadGen = new LoadGenerator(chain);
  loadGen.start(200); // 200 logs/sec
  await new Promise((r) => setTimeout(r, 600));
  loadGen.stop();
  const postLoadStats = agentDb.getStats();
  assert(postLoadStats.totalLogs > 100, "Load generator must have generated substantial logs");
  console.log(`  ✓ Load generator generated ${postLoadStats.totalLogs - 50} logs during short burst`);

  // Ingest the rest to collector and mark as batch 1
  const remaining = agentDb.getUnanchoredEntries(500);
  collectorDb.ingestBatch(remaining);
  const tree1 = new MerkleTree(remaining.map((e) => e.hash));
  agentDb.markAnchored(remaining[0].seq, remaining[remaining.length - 1].seq, 1);
  collectorDb.recordBatch({
    batchId: 1,
    startSeq: remaining[0].seq,
    endSeq: remaining[remaining.length - 1].seq,
    merkleRoot: tree1.rootWith0x,
    lastChainHash: "0x" + remaining[remaining.length - 1].hash,
    txHash: "0x" + "e".repeat(64),
    blockNumber: 43,
    timestamp: Math.floor(Date.now() / 1000),
  });

  // 6. Test Evidence Pack Export & Standalone Verification
  console.log("\n[Test 6] Evidence Pack Export & Standalone Auditor Verification");
  const evidenceOut = path.join(testDir, "evidence-pack.json");
  const pack = exportEvidencePack({
    victimDbPath,
    collectorDbPath,
    outputPath: evidenceOut,
  });
  assert(pack.stats.totalEntries === postLoadStats.totalLogs, "Pack total entries must match DB total logs");
  assert(pack.stats.tamperedEntries === 0, "Clean database must have 0 tampered entries");
  assert(fs.existsSync(evidenceOut), "evidence-pack.json must exist");
  assert(fs.existsSync(evidenceOut.replace(/\.json$/, "-report.md")), "evidence-pack-report.md must exist");
  console.log(`  ✓ Evidence pack successfully generated with ${pack.stats.totalEntries} entries across ${pack.stats.batchCount} batches`);

  // Run verify-standalone.js
  const verifierScript = path.resolve(import.meta.dirname, "../evidence/verify-standalone.js");
  const verifierOutput = execSync(`node "${verifierScript}" "${evidenceOut}" "http://127.0.0.1:8545"`, {
    encoding: "utf-8",
  });
  assert(verifierOutput.includes("AUDIT VERDICT: INTEGRITY VERIFIED (TAMPER-FREE)"), "Standalone verifier must pass clean pack");
  console.log("  ✓ Standalone verifier (verify-standalone.js) passed with 100% integrity verdict!");

  // 7. Test Attack Detection (Tamper simulation)
  console.log("\n[Test 7] Tamper Detection Check");
  const tamperedPack = JSON.parse(fs.readFileSync(evidenceOut, "utf-8"));
  // Attacker edits entry #2's message
  tamperedPack.entries[1].message = "ATTACKER ALTERED MESSAGE";
  const tamperedOut = path.join(testDir, "evidence-pack-tampered.json");
  fs.writeFileSync(tamperedOut, JSON.stringify(tamperedPack, null, 2), "utf-8");

  try {
    execSync(`node "${verifierScript}" "${tamperedOut}" "http://127.0.0.1:8545"`, { encoding: "utf-8" });
    throw new Error("Verifier should have failed on tampered pack!");
  } catch (err: any) {
    const output = (err.stdout ? err.stdout.toString() : "") + (err.stderr ? err.stderr.toString() : "") + (err.message || "");
    assert(
      output.includes("AUDIT VERDICT: EVIDENCE COMPROMISED"),
      "Verifier must output AUDIT VERDICT: EVIDENCE COMPROMISED"
    );
    console.log("  ✓ Standalone verifier correctly caught message modification and rejected evidence pack!");
  }

  // Cleanup test artifacts
  agentDb.close();
  collectorDb.close();
  fs.rmSync(testDir, { recursive: true, force: true });

  console.log("\n==================================================================");
  console.log("               ALL M2 TESTS PASSED SUCCESSFULLY!                  ");
  console.log("==================================================================");
}

runTests().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
