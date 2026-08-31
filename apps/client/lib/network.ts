const NETWORK_BY_RPC: Record<string, { name: string; chainId: string; isMainnet: boolean }> = {
  "evmrpc.0g.ai": { name: "0G Mainnet", chainId: "16661", isMainnet: true },
  "evmrpc-testnet.0g.ai": { name: "0G Testnet (Galileo)", chainId: "16602", isMainnet: false },
};

/**
 * Derives a human network label from whichever CHAIN_RPC_URL the
 * indexer is actually configured against — never hardcoded as "0G
 * Mainnet". If this instance is pointed at a different network
 * tomorrow, every caller of this reflects that honestly instead of
 * silently lying.
 */
export function networkFromRpc(rpcUrl: string | undefined): { name: string; chainId: string; isMainnet: boolean } {
  if (!rpcUrl) return { name: "unknown", chainId: "—", isMainnet: false };
  const match = Object.entries(NETWORK_BY_RPC).find(([host]) => rpcUrl.includes(host));
  if (match) return match[1];
  if (rpcUrl.includes("127.0.0.1") || rpcUrl.includes("localhost")) return { name: "Local devnet", chainId: "31337", isMainnet: false };
  return { name: "custom RPC", chainId: "—", isMainnet: false };
}
