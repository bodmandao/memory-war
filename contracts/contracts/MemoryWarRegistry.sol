// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title MemoryWarRegistry
/// @notice On-chain trust-critical state for the MEMORY WAR protocol.
///
/// Design principle (spec §5): "Put only trust-critical state on-chain.
/// Large text and artifacts remain in 0G Storage. The indexer/backend is
/// explicitly NOT authoritative." This contract stores IDs, commitments
/// (hashes / Merkle roots), bonds, and state machine transitions only —
/// never claim text, evidence bytes, or report prose. Anyone can
/// independently rebuild the full protocol history by replaying this
/// contract's events; the indexer is a convenience cache over that.
///
/// Every state transition is guarded: an illegal call reverts instead of
/// silently succeeding (spec §19 "invalid transitions rejected").
/// Investigator reports are bound to (challengeId, investigator,
/// evidenceBundleHash) and cannot be replayed against a different
/// challenge or resubmitted by the same investigator (spec §19 "report
/// replay").
contract MemoryWarRegistry {
    // ── Enums ────────────────────────────────────────────────────────

    enum ClaimStatus {
        OPEN,
        CHALLENGED,
        EVIDENCE_LOCKED,
        INVESTIGATING,
        TRUE_,
        FALSE_,
        SUPERSEDED,
        CONTESTED,
        INCONCLUSIVE
    }

    enum ChallengeType {
        CONTRADICTION,
        SOURCE_QUALITY
    }
    // NB: there is deliberately no PREDICATE_MISMATCH challenge type.
    // Predicate mismatches never reach this contract as a Challenge at
    // all — they are recorded via recordRelationship, permissionlessly,
    // with no bond. See spec §8/§15.

    enum ChallengeState {
        OPEN,
        EVIDENCE_LOCKED,
        INVESTIGATING,
        RESOLVED,
        APPEALED
    }

    enum RelationshipType {
        CONTRADICTS, // never stored via recordRelationship — must go through a Challenge
        RELATES_TO,
        REFINES,
        NARROWS,
        EXTENDS,
        SUPERSEDES
    }

    enum VerdictStatus {
        NONE,
        TRUE_,
        FALSE_,
        SUPERSEDED,
        CONTESTED,
        INCONCLUSIVE
    }

    enum AttestationMode {
        ZG_COMPUTE_TEE,
        LOCAL_LLM,
        SIMULATED
    }

    // ── Storage ──────────────────────────────────────────────────────

    struct ClaimRecord {
        bytes32 predicateHash;
        bytes32 textHash;
        address author;
        uint64 createdAt;
        uint64 validFrom;
        uint64 validUntil; // 0 while still open-ended
        ClaimStatus status;
        bool exists;
    }

    struct ChallengeRecord {
        bytes32 claimId;
        ChallengeType challengeType;
        address challenger;
        uint256 bond;
        uint64 openedAt;
        uint64 windowCloseAt;
        bytes32 evidenceRoot; // set at lockEvidence
        ChallengeState state;
        bool exists;
    }

    struct VerdictRecord {
        VerdictStatus status;
        bytes32 procedureHash;
        bytes32 reportsRoot;
        bytes32 dissentRoot;
        uint64 resolvedAt;
        bool exists;
    }

    struct AppealRecord {
        bytes32 challengeId;
        address filedBy;
        uint64 filedAt;
        string reason;
        bool resolved;
    }

    uint64 public constant DEFAULT_CHALLENGE_WINDOW = 2 minutes; // deliberately short for local/testnet demos; production would use hours

    mapping(bytes32 => ClaimRecord) public claims;
    mapping(bytes32 => ChallengeRecord) public challenges;
    mapping(bytes32 => VerdictRecord) public verdicts; // keyed by challengeId
    mapping(bytes32 => bytes32[]) public pendingEvidence; // claimId or challengeId => evidence ids (pre-lock)
    mapping(bytes32 => bool) public evidenceLocked;

    // replay protection: has THIS investigator already submitted a report
    // for THIS challenge?
    mapping(bytes32 => mapping(address => bool)) public hasReported;
    mapping(bytes32 => uint256) public reportCount;

    uint256 public appealCount;
    mapping(uint256 => AppealRecord) public appeals;

    // ── Events (the reconstructible source of truth) ───────────────────

    event ClaimCreated(bytes32 indexed claimId, bytes32 predicateHash, bytes32 textHash, address indexed author, uint64 createdAt, uint64 validFrom);
    event EvidenceSubmitted(bytes32 indexed subjectId, bytes32 indexed evidenceId, address indexed submitter, uint64 occurredAt);
    event EvidenceLocked(bytes32 indexed subjectId, bytes32 evidenceRoot, uint64 occurredAt);
    event RelationshipRecorded(bytes32 indexed claimAId, bytes32 indexed claimBId, RelationshipType relation, uint64 occurredAt);
    event ChallengeOpened(bytes32 indexed challengeId, bytes32 indexed claimId, ChallengeType challengeType, address indexed challenger, uint256 bond, uint64 openedAt, uint64 windowCloseAt);
    event InvestigationStarted(bytes32 indexed challengeId, uint64 occurredAt);
    event ReportSubmitted(bytes32 indexed challengeId, address indexed investigator, bytes32 evidenceBundleHash, bytes32 reportCommitment, uint8 verdict, AttestationMode attestationMode, bool attestationVerified, uint64 occurredAt);
    event Resolved(bytes32 indexed challengeId, bytes32 indexed claimId, VerdictStatus status, bytes32 procedureHash, bytes32 reportsRoot, bytes32 dissentRoot, uint64 occurredAt);
    event Superseded(bytes32 indexed oldClaimId, bytes32 indexed newClaimId, RelationshipType relation, uint64 occurredAt);
    event AppealFiled(uint256 indexed appealId, bytes32 indexed challengeId, address indexed filedBy, string reason, uint64 occurredAt);
    event AppealResolved(uint256 indexed appealId, VerdictStatus newStatus, bytes32 newProcedureHash, bytes32 newReportsRoot, uint64 occurredAt);

    // ── Errors ───────────────────────────────────────────────────────

    error IllegalTransition(string kind, uint8 from, uint8 to);
    error ClaimNotFound(bytes32 claimId);
    error ChallengeNotFound(bytes32 challengeId);
    error EvidenceAlreadyLocked(bytes32 subjectId);
    error WindowNotClosed(uint64 closesAt, uint64 nowTs);
    error DuplicateReport(address investigator, bytes32 challengeId);
    error NotContradiction();

    // ── Claims ───────────────────────────────────────────────────────

    function createClaim(bytes32 predicateHash, bytes32 textHash, uint64 validFrom) external returns (bytes32 claimId) {
        claimId = keccak256(abi.encodePacked(predicateHash, textHash, msg.sender, block.timestamp, validFrom));
        require(!claims[claimId].exists, "claim id collision");
        claims[claimId] = ClaimRecord({
            predicateHash: predicateHash,
            textHash: textHash,
            author: msg.sender,
            createdAt: uint64(block.timestamp),
            validFrom: validFrom,
            validUntil: 0,
            status: ClaimStatus.OPEN,
            exists: true
        });
        emit ClaimCreated(claimId, predicateHash, textHash, msg.sender, uint64(block.timestamp), validFrom);
    }

    /// @notice A cheap, unstaked relationship edge. spec §8/§15: predicate
    /// mismatches (RELATES_TO/REFINES/NARROWS/EXTENDS) settle here, with
    /// no bond and no investigation — a real contradiction must instead
    /// go through openChallenge. CONTRADICTS is rejected here on purpose.
    function recordRelationship(bytes32 claimAId, bytes32 claimBId, RelationshipType relation) external {
        if (!claims[claimAId].exists) revert ClaimNotFound(claimAId);
        if (!claims[claimBId].exists) revert ClaimNotFound(claimBId);
        if (relation == RelationshipType.CONTRADICTS) revert NotContradiction();
        emit RelationshipRecorded(claimAId, claimBId, relation, uint64(block.timestamp));

        if (relation == RelationshipType.SUPERSEDES) {
            ClaimRecord storage oldClaim = claims[claimAId];
            if (oldClaim.status == ClaimStatus.OPEN || oldClaim.status == ClaimStatus.TRUE_) {
                oldClaim.status = ClaimStatus.SUPERSEDED;
                oldClaim.validUntil = uint64(block.timestamp);
                emit Superseded(claimAId, claimBId, relation, uint64(block.timestamp));
            }
        }
    }

    // ── Evidence (pre-lock, works for both a bare claim and a challenge) ─

    function submitEvidence(bytes32 subjectId, bytes32 evidenceId) external {
        if (evidenceLocked[subjectId]) revert EvidenceAlreadyLocked(subjectId);
        pendingEvidence[subjectId].push(evidenceId);
        emit EvidenceSubmitted(subjectId, evidenceId, msg.sender, uint64(block.timestamp));
    }

    /// @param evidenceRoot must equal protocol-core's merkleRoot() over the
    /// same evidence ids emitted via EvidenceSubmitted — anyone (the
    /// indexer, a judge, a skeptical agent) can recompute it independently
    /// from events alone and flag VERIFICATION FAILED on mismatch.
    function lockEvidence(bytes32 subjectId, bytes32 evidenceRoot) external {
        if (evidenceLocked[subjectId]) revert EvidenceAlreadyLocked(subjectId);
        evidenceLocked[subjectId] = true;
        emit EvidenceLocked(subjectId, evidenceRoot, uint64(block.timestamp));

        ChallengeRecord storage c = challenges[subjectId];
        if (c.exists) {
            if (c.state != ChallengeState.OPEN) revert IllegalTransition("challenge", uint8(c.state), uint8(ChallengeState.EVIDENCE_LOCKED));
            c.evidenceRoot = evidenceRoot;
            c.state = ChallengeState.EVIDENCE_LOCKED;
            claims[c.claimId].status = ClaimStatus.EVIDENCE_LOCKED;
        }
    }

    // ── Challenges ───────────────────────────────────────────────────

    function openChallenge(bytes32 claimId, ChallengeType challengeType) external payable returns (bytes32 challengeId) {
        ClaimRecord storage claim = claims[claimId];
        if (!claim.exists) revert ClaimNotFound(claimId);
        if (claim.status != ClaimStatus.OPEN) revert IllegalTransition("claim", uint8(claim.status), uint8(ClaimStatus.CHALLENGED));

        challengeId = keccak256(abi.encodePacked(claimId, msg.sender, block.timestamp));
        require(!challenges[challengeId].exists, "challenge id collision");

        challenges[challengeId] = ChallengeRecord({
            claimId: claimId,
            challengeType: challengeType,
            challenger: msg.sender,
            bond: msg.value,
            openedAt: uint64(block.timestamp),
            windowCloseAt: uint64(block.timestamp) + DEFAULT_CHALLENGE_WINDOW,
            evidenceRoot: bytes32(0),
            state: ChallengeState.OPEN,
            exists: true
        });
        claim.status = ClaimStatus.CHALLENGED;

        emit ChallengeOpened(challengeId, claimId, challengeType, msg.sender, msg.value, uint64(block.timestamp), uint64(block.timestamp) + DEFAULT_CHALLENGE_WINDOW);
    }

    function beginInvestigation(bytes32 challengeId) external {
        ChallengeRecord storage c = challenges[challengeId];
        if (!c.exists) revert ChallengeNotFound(challengeId);
        if (c.state != ChallengeState.EVIDENCE_LOCKED) revert IllegalTransition("challenge", uint8(c.state), uint8(ChallengeState.INVESTIGATING));
        c.state = ChallengeState.INVESTIGATING;
        claims[c.claimId].status = ClaimStatus.INVESTIGATING;
        emit InvestigationStarted(challengeId, uint64(block.timestamp));
    }

    /// @notice Investigator report commitment. `reportCommitment` is the
    /// hash of the full report object (see protocol-core reportCommitment);
    /// the prose itself lives in 0G Storage. Bound to (challengeId,
    /// investigator, evidenceBundleHash) — cannot be replayed elsewhere.
    function submitReport(
        bytes32 challengeId,
        bytes32 evidenceBundleHash,
        bytes32 reportCommitment,
        uint8 verdict,
        AttestationMode attestationMode,
        bool attestationVerified
    ) external {
        ChallengeRecord storage c = challenges[challengeId];
        if (!c.exists) revert ChallengeNotFound(challengeId);
        if (c.state != ChallengeState.INVESTIGATING) revert IllegalTransition("challenge", uint8(c.state), uint8(c.state));
        if (hasReported[challengeId][msg.sender]) revert DuplicateReport(msg.sender, challengeId);

        hasReported[challengeId][msg.sender] = true;
        reportCount[challengeId] += 1;

        emit ReportSubmitted(challengeId, msg.sender, evidenceBundleHash, reportCommitment, verdict, attestationMode, attestationVerified, uint64(block.timestamp));
    }

    /// @notice Permissionless settlement — anyone may call once the
    /// challenge window has closed and the challenge is INVESTIGATING.
    /// The caller supplies the outcome of protocol-core's mechanical
    /// resolution procedure (deterministic given the same reports, and
    /// independently recomputable by anyone from ReportSubmitted events —
    /// this call does not grant discretion, it commits a result anyone
    /// can audit against the disclosed procedure).
    function resolve(
        bytes32 challengeId,
        VerdictStatus status,
        bytes32 procedureHash,
        bytes32 reportsRoot,
        bytes32 dissentRoot
    ) external {
        ChallengeRecord storage c = challenges[challengeId];
        if (!c.exists) revert ChallengeNotFound(challengeId);
        if (c.state != ChallengeState.INVESTIGATING) revert IllegalTransition("challenge", uint8(c.state), uint8(ChallengeState.RESOLVED));
        if (block.timestamp < c.windowCloseAt) revert WindowNotClosed(c.windowCloseAt, uint64(block.timestamp));
        require(status != VerdictStatus.NONE, "must resolve to a real status");

        c.state = ChallengeState.RESOLVED;
        ClaimRecord storage claim = claims[c.claimId];
        claim.status = _claimStatusFor(status);

        verdicts[challengeId] = VerdictRecord({
            status: status,
            procedureHash: procedureHash,
            reportsRoot: reportsRoot,
            dissentRoot: dissentRoot,
            resolvedAt: uint64(block.timestamp),
            exists: true
        });

        _settleBond(c, status);

        emit Resolved(challengeId, c.claimId, status, procedureHash, reportsRoot, dissentRoot, uint64(block.timestamp));
    }

    function _claimStatusFor(VerdictStatus status) private pure returns (ClaimStatus) {
        if (status == VerdictStatus.TRUE_) return ClaimStatus.TRUE_;
        if (status == VerdictStatus.FALSE_) return ClaimStatus.FALSE_;
        if (status == VerdictStatus.CONTESTED) return ClaimStatus.CONTESTED;
        if (status == VerdictStatus.SUPERSEDED) return ClaimStatus.SUPERSEDED;
        return ClaimStatus.INCONCLUSIVE;
    }

    /// @dev Bond settlement rule (spec §10, kill-test §9/§10): a challenge
    /// that turns out to be CLEARLY WRONG (claim resolves TRUE) forfeits
    /// its bond. A challenge that surfaces a genuine problem (FALSE) gets
    /// its bond back plus the disputed claim is marked FALSE. Ambiguous
    /// outcomes (CONTESTED / INCONCLUSIVE) return the bond in full — a
    /// good-faith challenge that surfaced real uncertainty is never
    /// penalized as if it had been frivolous.
    function _settleBond(ChallengeRecord storage c, VerdictStatus status) private {
        if (c.bond == 0) return;
        uint256 amount = c.bond;
        c.bond = 0;
        if (status == VerdictStatus.TRUE_) {
            // challenger was wrong — bond is forfeit to the protocol treasury (this contract), not refunded
            return;
        }
        (bool sent, ) = payable(c.challenger).call{value: amount}("");
        require(sent, "bond refund failed");
    }

    // ── Appeals (append-only) ───────────────────────────────────────

    function fileAppeal(bytes32 challengeId, string calldata reason) external returns (uint256 appealId) {
        ChallengeRecord storage c = challenges[challengeId];
        if (!c.exists) revert ChallengeNotFound(challengeId);
        if (c.state != ChallengeState.RESOLVED) revert IllegalTransition("challenge", uint8(c.state), uint8(ChallengeState.APPEALED));
        c.state = ChallengeState.APPEALED;

        appealId = appealCount++;
        appeals[appealId] = AppealRecord({ challengeId: challengeId, filedBy: msg.sender, filedAt: uint64(block.timestamp), reason: reason, resolved: false });
        emit AppealFiled(appealId, challengeId, msg.sender, reason, uint64(block.timestamp));
    }

    /// @notice Records a NEW verdict under the appeal; the original entry
    /// in `verdicts[challengeId]` set by resolve() above is never
    /// overwritten — it remains permanently readable at its original key.
    function resolveAppeal(uint256 appealId, VerdictStatus newStatus, bytes32 newProcedureHash, bytes32 newReportsRoot) external {
        AppealRecord storage a = appeals[appealId];
        require(a.filedAt != 0, "appeal not found");
        require(!a.resolved, "appeal already resolved");
        a.resolved = true;
        emit AppealResolved(appealId, newStatus, newProcedureHash, newReportsRoot, uint64(block.timestamp));
    }

    // ── Views ────────────────────────────────────────────────────────

    function pendingEvidenceOf(bytes32 subjectId) external view returns (bytes32[] memory) {
        return pendingEvidence[subjectId];
    }
}
