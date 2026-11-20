/**
 * Deploy AnchorRegistry and write deployments/<network>.json so every other
 * service (anchor-service, verifier, evidence, dashboard) can find the contract.
 *
 *   npx hardhat node                  # terminal 1 (fresh chain = reset)
 *   npm run deploy:local              # terminal 2
 *
 * ANCHORER_ADDRESS sets the anchorer. If it is not set, the deployer is used
 * (Hardhat account #0).
 */
import { ethers, network, artifacts } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const anchorer = process.env.ANCHORER_ADDRESS ?? deployer.address;
  if (!ethers.isAddress(anchorer)) throw new Error(`ANCHORER_ADDRESS is not an address: ${anchorer}`);

  const Registry = await ethers.getContractFactory("AnchorRegistry");
  const registry = await Registry.deploy(anchorer);
  await registry.waitForDeployment();
  const receipt = await registry.deploymentTransaction()!.wait();

  const address = await registry.getAddress();
  const { chainId } = await ethers.provider.getNetwork();
  const artifact = await artifacts.readArtifact("AnchorRegistry");

  const deployment = {
    contract: "AnchorRegistry",
    network: network.name,
    chainId: Number(chainId),
    address,
    deployer: deployer.address,
    anchorer,
    deployBlock: receipt!.blockNumber,
    deployTx: receipt!.hash,
    deployedAt: new Date().toISOString(),
    abi: artifact.abi,
  };

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${network.name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));

  console.log(`AnchorRegistry deployed`);
  console.log(`  network   ${network.name} (chainId ${chainId})`);
  console.log(`  address   ${address}`);
  console.log(`  anchorer  ${anchorer}`);
  console.log(`  block     ${receipt!.blockNumber}`);
  console.log(`  wrote     ${path.relative(process.cwd(), outFile)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
