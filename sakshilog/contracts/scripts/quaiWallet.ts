/**
 * Generates a brand-new, dedicated Quai Network wallet valid for the Cyprus-1 zone
 * (the only zone that currently exists on Orchard/mainnet - see implementation/
 * PROGRESS.md, M1 log). Prints the address, private key and recovery mnemonic to the
 * terminal ONLY - nothing is written to disk, so there is nothing here to accidentally
 * commit.
 *
 * Per the sponsor's own safety rules (and ours): this key must never hold real funds,
 * must never be reused from an existing wallet, and must never be pasted into chat or
 * committed anywhere. Put the printed private key into contracts/.env as CYPRUS1_PK
 * (gitignored) and fund the printed address via https://orchard.faucet.quai.network
 * before running `npm run deploy:quai`.
 *
 * Deliberately does NOT use QuaiHDWallet.createRandom() - that generates its own
 * mnemonic internally but never returns it to the caller, so there would be no way to
 * print a recovery phrase. Generating the mnemonic ourselves first (via Mnemonic.
 * fromEntropy) keeps it in hand throughout.
 *
 *   npm run quai:wallet
 */
import * as crypto from "node:crypto";
import * as quais from "quais";

async function main() {
  const entropy = crypto.randomBytes(32); // 32 bytes -> 24-word mnemonic (the strongest standard BIP-39 length)
  const mnemonic = quais.Mnemonic.fromEntropy(entropy);
  const hdWallet = quais.QuaiHDWallet.fromMnemonic(mnemonic);

  // account 0, address index 0 in the Cyprus-1 zone - the first address this mnemonic
  // derives for that zone.
  const info = await hdWallet.getNextAddress(0, quais.Zone.Cyprus1);
  const privateKey = hdWallet.getPrivateKey(info.address);

  // Independent sanity check using the SDK's own zone/ledger lookups (not our own byte
  // math) - defense in depth against a documentation or derivation-path surprise, since
  // Quai's own docs don't actually promise getNextAddress's return is already
  // zone-correct (it should be, by construction, but this costs nothing to verify).
  const zone = quais.getZoneForAddress(info.address);
  const isQuaiLedger = quais.isQuaiAddress(info.address);
  const ok = zone === quais.Zone.Cyprus1 && isQuaiLedger;

  console.log("==================================================================");
  console.log("  New Quai Network wallet (Cyprus-1 zone)");
  console.log("==================================================================");
  console.log(`  Address      ${info.address}`);
  console.log(`  Private key  ${privateKey}`);
  console.log(`  Mnemonic     ${mnemonic.phrase}`);
  console.log(`  Zone check   ${ok ? "OK - Cyprus-1, Quai ledger" : `FAILED (zone=${zone}, isQuaiLedger=${isQuaiLedger}) - do not use this key, re-run`}`);
  console.log("==================================================================");
  console.log("  Next steps:");
  console.log("  1. Save the mnemonic somewhere safe and offline (not in this repo).");
  console.log("  2. Fund the address: https://orchard.faucet.quai.network");
  console.log("  3. Put the private key in contracts/.env as CYPRUS1_PK (gitignored).");
  console.log("  4. This wallet is for Orchard TESTNET use only - never send it real-value assets.");
  console.log("==================================================================");

  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
