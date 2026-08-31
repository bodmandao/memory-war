// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title InvestigatorRegistry
/// @notice Portable investigator identity — deliberately NOT an ERC-7857
/// Agentic ID.
///
/// ERC-7857 exists to make an agent's "intelligence" (weights, prompts,
/// training data) an encrypted, transferable, ownable secret — the right
/// primitive for a proprietary trading bot or a personal assistant whose
/// value is what it knows privately. An investigator is the opposite
/// case: its entire value to MEMORY WAR is that its model identity,
/// version lineage, and track record stay maximally PUBLIC and
/// non-transferable-without-consequence. If an investigator's identity
/// were an ERC-7857 asset, someone could buy a "5-star investigator"
/// and silently swap in a different, worse model behind the same
/// reputation — precisely the kind of quiet substitution the calibration
/// history exists to make impossible. So: no encrypted metadata, no
/// transfer-with-intelligence. Identity here is closer to the
/// ERC-8004 Identity Registry pattern (a persistent, publicly
/// attributable agent ID with a rotatable controller key) than to
/// ERC-7857 — see docs/ERC7857_DECISION.md for the full reasoning.
///
/// An investigator registers once and gets a permanent `investigatorId`
/// that survives key rotation (an agent operator can rotate its signing
/// key without losing its calibration history) and records explicit
/// version lineage (a v2 model succeeding a v1 investigator).
/// MemoryWarRegistry.submitReportAsIdentity links individual signed
/// reports back to this persistent id; the indexer aggregates
/// calibration from there (see apps/indexer/src/eventStore.ts).
contract InvestigatorRegistry {
    struct Investigator {
        address controller;
        string modelProvider; // disclosed, e.g. "anthropic:claude-haiku-4-5" — never a secret
        bytes32 parentId; // bytes32(0) if this is not a successor to an earlier investigator
        uint64 registeredAt;
        bool exists;
    }

    mapping(bytes32 => Investigator) public investigators;

    event InvestigatorRegistered(bytes32 indexed investigatorId, address indexed controller, string modelProvider, bytes32 parentId, uint64 occurredAt);
    event ControllerRotated(bytes32 indexed investigatorId, address indexed oldController, address indexed newController, uint64 occurredAt);

    error InvestigatorNotFound(bytes32 investigatorId);
    error NotController(bytes32 investigatorId, address caller);

    /// @param parentId pass bytes32(0) for a brand-new investigator, or an
    /// existing investigatorId to record this as an explicit successor
    /// version (spec: "investigator versions... version lineage").
    function register(string calldata modelProvider, bytes32 parentId) external returns (bytes32 investigatorId) {
        if (parentId != bytes32(0)) {
            if (!investigators[parentId].exists) revert InvestigatorNotFound(parentId);
            // Only the parent identity's own current controller may
            // register an official successor to it — otherwise anyone
            // could attach a brand-new identity to someone else's
            // accumulated reputation lineage by simply naming their
            // investigatorId as a "parent" they never controlled.
            if (investigators[parentId].controller != msg.sender) revert NotController(parentId, msg.sender);
        }
        investigatorId = keccak256(abi.encodePacked(msg.sender, modelProvider, parentId, block.timestamp));
        require(!investigators[investigatorId].exists, "id collision");
        investigators[investigatorId] = Investigator({
            controller: msg.sender,
            modelProvider: modelProvider,
            parentId: parentId,
            registeredAt: uint64(block.timestamp),
            exists: true
        });
        emit InvestigatorRegistered(investigatorId, msg.sender, modelProvider, parentId, uint64(block.timestamp));
    }

    /// @notice Lets an operator rotate the signing key behind an identity
    /// without losing the identity's accumulated calibration history —
    /// the whole point of separating "who signed this report" from
    /// "which persistent track record does it belong to".
    function rotateController(bytes32 investigatorId, address newController) external {
        Investigator storage inv = investigators[investigatorId];
        if (!inv.exists) revert InvestigatorNotFound(investigatorId);
        if (inv.controller != msg.sender) revert NotController(investigatorId, msg.sender);
        require(newController != address(0), "cannot rotate to the zero address");
        address old = inv.controller;
        inv.controller = newController;
        emit ControllerRotated(investigatorId, old, newController, uint64(block.timestamp));
    }

    function controllerOf(bytes32 investigatorId) external view returns (address) {
        return investigators[investigatorId].controller;
    }
}
