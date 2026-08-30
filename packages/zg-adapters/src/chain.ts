/**
 * 0G Chain adapter: a thin, typed wrapper around MemoryWarRegistry.
 *
 * This talks to whatever EVM endpoint it is pointed at — a local
 * Hardhat devnet by default, or the live 0G testnet if CHAIN_RPC_URL
 * and CHAIN_PRIVATE_KEY point there (spec §5: "the indexer/backend is
 * explicitly NOT authoritative" — this adapter is how anything, indexer
 * included, reads the one authoritative source of trust-critical state).
 *
 * The ABI below is the human-readable mirror of
 * contracts/contracts/MemoryWarRegistry.sol — kept here rather than
 * imported from Hardhat's build artifacts so this package has no build
 * order dependency on `contracts`. contracts/test/*.test.ts is the
 * cross-check that the Solidity source and this ABI stay in sync.
 */
import { Contract, JsonRpcProvider, Wallet, type Signer } from "ethers";
import type { Hash } from "@memory-war/protocol-core";

export const MEMORY_WAR_ABI = [
  "function createClaim(bytes32 predicateHash, bytes32 textHash, uint64 validFrom) returns (bytes32 claimId)",
  "function recordRelationship(bytes32 claimAId, bytes32 claimBId, uint8 relation)",
  "function submitEvidence(bytes32 subjectId, bytes32 evidenceId)",
  "function lockEvidence(bytes32 subjectId, bytes32 evidenceRoot)",
  "function openChallenge(bytes32 claimId, uint8 challengeType) payable returns (bytes32 challengeId)",
  "function requestVerification(bytes32 claimId) payable returns (bytes32 requestId)",
  "function beginInvestigation(bytes32 challengeId)",
  "function submitReport(bytes32 challengeId, bytes32 evidenceBundleHash, bytes32 reportCommitment, uint8 verdict, uint8 attestationMode, bool attestationVerified)",
  "function submitReportAsIdentity(bytes32 challengeId, bytes32 investigatorId, bytes32 evidenceBundleHash, bytes32 reportCommitment, uint8 verdict, uint8 attestationMode, bool attestationVerified)",
  "function resolve(bytes32 challengeId, uint8 status, bytes32 procedureHash, bytes32 reportsRoot, bytes32 dissentRoot)",
  "function fileAppeal(bytes32 challengeId, string reason) returns (uint256 appealId)",
  "function resolveAppeal(uint256 appealId, uint8 newStatus, bytes32 newProcedureHash, bytes32 newReportsRoot)",
  "function claims(bytes32) view returns (bytes32 predicateHash, bytes32 textHash, address author, uint64 createdAt, uint64 validFrom, uint64 validUntil, uint8 status, bool exists)",
  "function challenges(bytes32) view returns (bytes32 claimId, uint8 challengeType, address challenger, uint256 bond, uint64 openedAt, uint64 windowCloseAt, bytes32 evidenceRoot, uint8 state, bool exists)",
  "function verdicts(bytes32) view returns (uint8 status, bytes32 procedureHash, bytes32 reportsRoot, bytes32 dissentRoot, uint64 resolvedAt, bool exists)",
  "function pendingEvidenceOf(bytes32 subjectId) view returns (bytes32[])",
  "function investigatorRegistry() view returns (address)",
  "event ClaimCreated(bytes32 indexed claimId, bytes32 predicateHash, bytes32 textHash, address indexed author, uint64 createdAt, uint64 validFrom)",
  "event EvidenceSubmitted(bytes32 indexed subjectId, bytes32 indexed evidenceId, address indexed submitter, uint64 occurredAt)",
  "event EvidenceLocked(bytes32 indexed subjectId, bytes32 evidenceRoot, uint64 occurredAt)",
  "event RelationshipRecorded(bytes32 indexed claimAId, bytes32 indexed claimBId, uint8 relation, uint64 occurredAt)",
  "event ChallengeOpened(bytes32 indexed challengeId, bytes32 indexed claimId, uint8 challengeType, address indexed challenger, uint256 bond, uint64 openedAt, uint64 windowCloseAt)",
  "event InvestigationStarted(bytes32 indexed challengeId, uint64 occurredAt)",
  "event ReportSubmitted(bytes32 indexed challengeId, address indexed investigator, bytes32 evidenceBundleHash, bytes32 reportCommitment, uint8 verdict, uint8 attestationMode, bool attestationVerified, uint64 occurredAt)",
  "event Resolved(bytes32 indexed challengeId, bytes32 indexed claimId, uint8 status, bytes32 procedureHash, bytes32 reportsRoot, bytes32 dissentRoot, uint64 occurredAt)",
  "event Superseded(bytes32 indexed oldClaimId, bytes32 indexed newClaimId, uint8 relation, uint64 occurredAt)",
  "event AppealFiled(uint256 indexed appealId, bytes32 indexed challengeId, address indexed filedBy, string reason, uint64 occurredAt)",
  "event AppealResolved(uint256 indexed appealId, uint8 newStatus, bytes32 newProcedureHash, bytes32 newReportsRoot, uint64 occurredAt)",
  "event InvestigatorPaid(bytes32 indexed challengeId, address indexed investigator, uint256 amount, uint64 occurredAt)",
  "event ReportIdentityLinked(bytes32 indexed challengeId, address indexed investigator, bytes32 indexed investigatorId)",
] as const;

export const INVESTIGATOR_REGISTRY_ABI = [
  "function register(string modelProvider, bytes32 parentId) returns (bytes32 investigatorId)",
  "function rotateController(bytes32 investigatorId, address newController)",
  "function controllerOf(bytes32 investigatorId) view returns (address)",
  "function investigators(bytes32) view returns (address controller, string modelProvider, bytes32 parentId, uint64 registeredAt, bool exists)",
  "event InvestigatorRegistered(bytes32 indexed investigatorId, address indexed controller, string modelProvider, bytes32 parentId, uint64 occurredAt)",
  "event ControllerRotated(bytes32 indexed investigatorId, address indexed oldController, address indexed newController, uint64 occurredAt)",
] as const;

export type ChainNetworkLabel = "0G_TESTNET" | "0G_MAINNET" | "LOCAL_DEVNET" | "UNKNOWN_EVM";

export interface ChainConfig {
  rpcUrl?: string;
  privateKey?: string;
  contractAddress?: string;
  investigatorRegistryAddress?: string;
}

export class ZgChainAdapter {
  readonly provider: JsonRpcProvider;
  readonly signer: Signer;
  readonly contract: Contract;
  readonly investigatorRegistry: Contract | null;
  readonly rpcUrl: string;
  private readonly investigatorRegistryAddress?: string;

  constructor(config: ChainConfig = {}) {
    this.rpcUrl = config.rpcUrl ?? process.env.CHAIN_RPC_URL ?? "http://127.0.0.1:8545";
    const privateKey = config.privateKey ?? process.env.CHAIN_PRIVATE_KEY;
    const address = config.contractAddress ?? process.env.MEMORY_WAR_CONTRACT_ADDRESS;
    if (!address) throw new Error("MEMORY_WAR_CONTRACT_ADDRESS is required — deploy the contract first (npm run chain:deploy:local)");
    this.investigatorRegistryAddress = config.investigatorRegistryAddress ?? process.env.INVESTIGATOR_REGISTRY_ADDRESS;

    // cacheTimeout disabled (default is 250ms): ethers' AbstractProvider
    // memoizes identical in-flight/recent RPC calls — same method + same
    // params — and hands every caller within that window the same cached
    // promise. eth_getTransactionCount(address, "pending") is such a call.
    // Two writes from the same signer issued back-to-back (e.g. two
    // sequential contract calls in one scenario step) can both resolve
    // their nonce inside that 250ms window: the first genuinely queries
    // the node, the second is handed the *same* cached "pending" value
    // instead of a fresh one — even though Hardhat's instant automining
    // already consumed that nonce for the first transaction. The result
    // is two transactions signed with the identical nonce, and the
    // second is rejected as NONCE_EXPIRED ("Nonce too low"). This is not
    // a chain-level race (each adapter's own reads and writes are
    // ordered); it is this client-side read cache handing back a stale
    // answer. Disabling it costs, at most, a handful of extra
    // eth_getTransactionCount calls per scenario — it does not touch
    // `pollingInterval` and does not change how fast `.wait()` observes
    // confirmations, so there is no latency tradeoff here, correctness
    // only. See docs/AUDIT.md.
    this.provider = new JsonRpcProvider(this.rpcUrl, undefined, { cacheTimeout: -1 });
    this.signer = privateKey ? new Wallet(privateKey, this.provider) : (this.provider as unknown as Signer);
    this.contract = new Contract(address, MEMORY_WAR_ABI, this.signer);
    this.investigatorRegistry = this.investigatorRegistryAddress
      ? new Contract(this.investigatorRegistryAddress, INVESTIGATOR_REGISTRY_ABI, this.signer)
      : null;
  }

  async networkLabel(): Promise<ChainNetworkLabel> {
    const net = await this.provider.getNetwork();
    const id = Number(net.chainId);
    if (id === 16602 || id === 16600) return "0G_TESTNET"; // Galileo family — verify against docs.0g.ai before treating as authoritative
    if (id === 16661) return "0G_MAINNET";
    if (id === 31337) return "LOCAL_DEVNET";
    return "UNKNOWN_EVM";
  }

  /**
   * Returns a new adapter signing as `privateKey`. Awaits the new
   * provider's network detection before returning — a fresh
   * JsonRpcProvider's very first RPC call otherwise races its own
   * internal readiness handshake, which previously showed up as
   * intermittent "nonce too low" errors on the first transaction sent
   * through a newly-connected role (see docs/AUDIT.md).
   */
  async connectAs(privateKey: string): Promise<ZgChainAdapter> {
    const adapter = new ZgChainAdapter({
      rpcUrl: this.rpcUrl,
      privateKey,
      contractAddress: this.contract.target as string,
      investigatorRegistryAddress: this.investigatorRegistryAddress,
    });
    await adapter.provider.getNetwork();
    return adapter;
  }

  async replayAllEvents(fromBlock = 0): Promise<import("ethers").Log[]> {
    return this.provider.getLogs({ address: this.contract.target as string, fromBlock, toBlock: "latest" });
  }

  asHash(v: unknown): Hash {
    return String(v) as Hash;
  }
}
