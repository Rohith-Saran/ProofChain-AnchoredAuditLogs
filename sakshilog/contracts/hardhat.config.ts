import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

// Optional dotenv loader
try {
  require("dotenv").config();
} catch {
  // dotenv is optional
}

// Optional Quai Network plugins (loaded if installed, skipped for localhost)
try {
  require("@quai/quais-upgrades");
  require("@quai/hardhat-deploy-metadata");
} catch {
  // Quai plugins are only required when deploying to Quai Network
}

const config: HardhatUserConfig = {
  solidity: {
    // 0.8.20 / evmVersion "london" / metadata.bytecodeHash "ipfs": exactly Quai's own
    // pinned compiler settings (dominant-strategies/hardhat-example). One shared build
    // for every network, including localhost - Quaiscan verification only works if the
    // bytecode you deployed was compiled with these exact settings.
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 1000 },
      evmVersion: "london",
      metadata: { bytecodeHash: "ipfs" },
    },
  },
  networks: {
    // `npx hardhat node` serves this on 8545 (see INTERFACES.md ports)
    localhost: { url: process.env.CHAIN_RPC_URL ?? "http://127.0.0.1:8545" },

    // Quai Network's Orchard testnet, Cyprus-1 zone (the only zone that exists right
    // now - see implementation/PROGRESS.md). `accounts` is deliberately an empty array
    // when CYPRUS1_PK isn't set, rather than defaulting or throwing here, so every other
    // command (compile, test, deploy:local) keeps working with no .env at all; Hardhat
    // only errors if you actually run something against this network without a key.
    // CYPRUS1_PK must be a brand-new, dedicated testnet wallet - see
    // contracts/QUAI_DEPLOYMENT.md - never a key that holds real funds, and never
    // committed (contracts/.env is gitignored).
    cyprus1: {
      url: process.env.RPC_URL ?? "https://orchard.rpc.quai.network",
      accounts: process.env.CYPRUS1_PK ? [process.env.CYPRUS1_PK] : [],
      chainId: Number(process.env.CHAIN_ID ?? 15000),
    },
    // Same network, explicit full RPC path instead of the base URL + quais' usePathing
    // routing. Quai's own example ships both forms; keep this as a fallback if the base
    // URL + usePathing combination ever misroutes.
    cyprus1_fullpath: {
      url: "https://orchard.rpc.quai.network/cyprus1",
      accounts: process.env.CYPRUS1_PK ? [process.env.CYPRUS1_PK] : [],
      chainId: Number(process.env.CHAIN_ID ?? 15000),
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
};

export default config;
