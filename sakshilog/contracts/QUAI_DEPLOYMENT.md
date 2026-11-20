# Deploying AnchorRegistry to Quai Network (Orchard testnet, Cyprus-1 zone)

Sponsor requirement for track eligibility (see implementation/PROGRESS.md, M1 log, and
implementation/SakshiLog_16hr_Implementation_Plan.pdf, Phase 5): the smart contract must
be deployed on Quai Network using Quai's own tooling, not just any EVM chain. This does
**not** replace the local Hardhat chain used for the live demo — that stays the fast,
reproducible path everyone actually demos against. This is the additional, sponsor-facing
deployment.

**Honesty note** (see `implementation/SakshiLog_16hr_Implementation_Plan.pdf`, section 6's
"what not to add" spirit, applied here too): only one Quai zone — Cyprus-1 — exists on
Orchard or mainnet today. Quai's Prime/Region/Zone sharding and cross-zone messaging
(ETXs) are real architectural features, but this deployment doesn't exercise them — there
is nothing to shard across yet. What this *does* use for real: Quai's own `quais.js` SDK
and `@quai/hardhat-deploy-metadata` Hardhat plugin, not a generic ethers-pointed-at-a-new-
RPC swap.

## 1. Generate a dedicated wallet

```bash
cd contracts
npm run quai:wallet
```

This prints a brand-new address, private key, and recovery mnemonic for the Cyprus-1
zone — generated with `QuaiHDWallet` (Quai's own SDK class, not ad-hoc address grinding).
It writes nothing to disk.

- **Save the mnemonic somewhere safe and offline** — not in this repo, not in chat.
- This wallet must **never hold real funds**. It is Orchard-testnet-only, and must be a
  wallet you don't use anywhere else.

## 2. Fund it

Send yourself testnet QUAI at **https://orchard.faucet.quai.network**, using the address
`quai:wallet` just printed.

## 3. Configure `.env`

```bash
cp .env.example .env
```

Then fill in `CYPRUS1_PK` with the private key from step 1. `.env` is gitignored —
double-check `git status` never shows it before any commit.

Verify `RPC_URL` against **https://docs.qu.ai/** before using it — never trust a pasted
link. The pinned values in `.env.example` were correct as of this writing:
`https://orchard.rpc.quai.network`, chain ID `15000`.

## 4. Deploy

```bash
npm run deploy:quai
```

This runs `scripts/deployQuai.ts`, which:
1. Connects via `quais.JsonRpcProvider` (Quai's ethers-v6 fork, not plain ethers).
2. Checks the deployer's balance first and refuses to proceed at 0 (with a link back to
   the faucet) rather than attempting a doomed transaction.
3. Pushes the compiled contract's metadata to IPFS via
   `deployMetadata.pushMetadataToIPFS()` (`@quai/hardhat-deploy-metadata`), for later
   Quaiscan verification.
4. Deploys via `quais.ContractFactory`, which automatically grinds the new contract
   address to the Cyprus-1 shard prefix (quais handles this; we don't).
5. Writes `deployments/cyprus1.json` (same shape/convention as `deployments/localhost.json`
   from the local path) and prints the Quaiscan link.

If `network cyprus1`'s base-URL + `usePathing` combination ever misbehaves, there's a
`cyprus1_fullpath` network in `hardhat.config.ts` with the explicit
`https://orchard.rpc.quai.network/cyprus1` path as a fallback
(`npm run deploy:quai -- --network cyprus1_fullpath` — adjust the npm script's `--network`
flag, or run `npx hardhat run scripts/deployQuai.ts --network cyprus1_fullpath` directly).

## 5. Verify on Quaiscan (manual — no automated task exists yet)

```bash
curl https://ipfs.qu.ai/ipfs/<ipfsHash from the deploy output> > metadata/verify.json
```

Then at `https://quaiscan.io/contract-verification`: choose **Solidity (Standard JSON
input)**, set compiler version **0.8.20**, upload `verify.json`, click **Verify &
Publish**. (`@quai/hardhat-deploy-metadata`'s own docs mark automated verification as
"still under development".)

## Why these specific choices

- **Solidity 0.8.20, `evmVersion: "london"`, `metadata.bytecodeHash: "ipfs"`** — these are
  Quai's own pinned compiler settings (`dominant-strategies/hardhat-example`), not
  something we invented. `AnchorRegistry.sol`'s pragma was `^0.8.24`; nothing in the
  contract needs anything past 0.8.20, and compiling with a newer EVM target risks
  emitting opcodes (like `PUSH0` from Shanghai) Quai's EVM fork doesn't document support
  for.
- **The deployer wallet must itself be a Cyprus-1-valid address**, not just the contract.
  Quai's `ContractFactory` auto-grinds the *contract's* address to the right shard prefix,
  but says nothing about the deployer's own EOA. `scripts/quaiWallet.ts` uses
  `QuaiHDWallet.fromMnemonic(...).getNextAddress(0, Zone.Cyprus1)` — the SDK's own
  documented zone-derivation path — and then independently re-checks the result with
  `quais.getZoneForAddress()` / `quais.isQuaiAddress()` before printing it, rather than
  trusting either the derivation or a hand-rolled byte check alone.
