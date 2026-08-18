import "@nomicfoundation/hardhat-toolbox";
import type { HardhatUserConfig } from "hardhat/config";
import * as dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const ZG_TESTNET_RPC = process.env.CHAIN_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
const PRIVATE_KEY = process.env.CHAIN_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      // local devnet — this is where "ON-CHAIN VERIFIED" claims in this
      // repo actually run real EVM bytecode, deterministically, for
      // every test and every demo run by default.
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    // 0G Galileo testnet. Requires a funded wallet (see .env.example) —
    // this repo does not deploy here automatically. See docs/AUDIT.md
    // for exactly what has and has not been deployed live.
    zgTestnet: {
      url: ZG_TESTNET_RPC,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 16602, // Galileo testnet — verify against docs.0g.ai/developer-hub/testnet before relying on this in production
    },
  },
};

export default config;
