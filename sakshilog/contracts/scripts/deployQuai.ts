/**
 * Deploy AnchorRegistry to Quai Network's Orchard testnet, Cyprus-1 zone - the sponsor
 * requirement (see implementation/PROGRESS.md, M1 log, and implementation/
 * SakshiLog_16hr_Implementation_Plan.pdf, Phase 5). Uses Quai's own tooling, not a
 * generic ethers-pointed-at-a-new-RPC swap:
 *   - quais.js (Quai's ethers-v6 fork) for the provider/wallet/deploy transaction, since
 *     plain ethers doesn't know about Quai's sharded address space.
 *   - @quai/hardhat-deploy-metadata's deployMetadata.pushMetadataToIPFS(), so the
 *     deployment is Quaiscan-verifiable (requires metadata.bytecodeHash: "ipfs" in
 *     hardhat.config.ts, already set).
 *
 * Prerequisites (see contracts/QUAI_DEPLOYMENT.md):
 *   1. npm run quai:wallet                    - generate a dedicated testnet wallet
 *   2. Fund the printed address: https://orchard.faucet.quai.network
 *   3. Put the private key in contracts/.env as CYPRUS1_PK (gitignored)
 *   4. npm run deploy:quai
 *
 * ANCHORER_ADDRESS sets the anchorer, same env var as scripts/deploy.ts. If unset, the
 * deployer's own address is used.
 */
import { network, artifacts } from "hardhat";
import * as quais from "quais";
import * as fs from "node:fs";
import * as path from "node:path";

// deployMetadata is attached to the HRE at runtime by @quai/hardhat-deploy-metadata's
// extendEnvironment() (see hardhat.config.ts's `import "@quai/hardhat-deploy-metadata"`)
// - it has no TypeScript types of its own, so this is read off the module dynamically
// rather than as a named import.
const hardhatRuntime = require("hardhat") as { deployMetadata: { pushMetadataToIPFS(contractName: string): Promise<string> } };

async function main() {
  // network.config's static type is a union across the "hardhat" in-memory network and
  // HTTP networks like ours; cast since we only ever run this script with --network
  // cyprus1 / cyprus1_fullpath, both HTTP networks with url/accounts/chainId.
  const netConfig = network.config as { url?: string; accounts?: string[]; chainId?: number };
  const rpcUrl = netConfig.url;
  if (!rpcUrl) throw new Error(`Network ${network.name} has no url configured`);
  const accounts = netConfig.accounts ?? [];
  if (accounts.length === 0) {
    throw new Error(
      `No private key configured for network ${network.name}. Run "npm run quai:wallet" ` +
        `to generate a dedicated testnet wallet, fund it via https://orchard.faucet.quai.network, ` +
        `then set CYPRUS1_PK in contracts/.env.`
    );
  }

  const provider = new quais.JsonRpcProvider(rpcUrl, undefined, { usePathing: true });
  const wallet = new quais.Wallet(accounts[0], provider);

  console.log(`[deployQuai] Deployer address: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`[deployQuai] Deployer balance: ${quais.formatQuai(balance)} QUAI`);
  if (balance === 0n) {
    throw new Error(
      `Deployer ${wallet.address} has 0 balance on Orchard. Fund it first: ` +
        `https://orchard.faucet.quai.network`
    );
  }

  const anchorer = process.env.ANCHORER_ADDRESS ?? wallet.address;
  if (!quais.isAddress(anchorer)) throw new Error(`ANCHORER_ADDRESS is not an address: ${anchorer}`);

  const artifact = await artifacts.readArtifact("AnchorRegistry");

  // Pushes the compiled contract's metadata to IPFS so Quaiscan can later verify the
  // source against it (see contracts/QUAI_DEPLOYMENT.md for the manual verify steps -
  // no automated `hardhat verify` task exists for Quai yet).
  console.log("[deployQuai] Pushing contract metadata to IPFS...");
  const ipfsHash = await hardhatRuntime.deployMetadata.pushMetadataToIPFS("AnchorRegistry");
  console.log(`[deployQuai] IPFS metadata hash: ${ipfsHash}`);

  const factory = new quais.ContractFactory(artifact.abi, artifact.bytecode, wallet, ipfsHash);
  const registry = await factory.deploy(anchorer);
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  const deployTx = registry.deploymentTransaction();

  const deployment = {
    contract: "AnchorRegistry",
    network: network.name,
    chainId: Number(netConfig.chainId),
    address,
    deployer: wallet.address,
    anchorer,
    deployTx: deployTx?.hash ?? null,
    ipfsHash,
    deployedAt: new Date().toISOString(),
    abi: artifact.abi,
  };

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${network.name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));

  console.log("==================================================================");
  console.log("  AnchorRegistry deployed to Quai Network");
  console.log("==================================================================");
  console.log(`  network    ${network.name} (chainId ${deployment.chainId})`);
  console.log(`  address    ${address}`);
  console.log(`  anchorer   ${anchorer}`);
  console.log(`  tx         ${deployment.deployTx}`);
  console.log(`  explorer   https://orchard.quaiscan.io/address/${address}`);
  console.log(`  wrote      ${path.relative(process.cwd(), outFile)}`);
  console.log("==================================================================");
  console.log("  To verify on Quaiscan (no automated task exists yet):");
  console.log(`  1. curl https://ipfs.qu.ai/ipfs/${ipfsHash} > contracts/metadata/verify.json`);
  console.log("  2. https://quaiscan.io/contract-verification -> Solidity (Standard JSON input)");
  console.log("  3. Set compiler version 0.8.20, upload verify.json, Verify & Publish.");
  console.log("==================================================================");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
