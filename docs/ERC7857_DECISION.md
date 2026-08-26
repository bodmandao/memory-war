# Why investigator identity is not an ERC-7857 Agentic ID

**Short answer:** ERC-7857 makes an agent's intelligence a private,
transferable secret. An investigator's entire value to MEMORY WAR is
that its intelligence stays public and its history stays
non-transferable. Those are opposite designs.

## What ERC-7857 is for

ERC-7857 extends ERC-721 with encrypted, re-encryptable metadata so
that owning the token means owning the actual underlying model/prompt/
training data — and transferring the token transfers that intelligence,
re-encrypted for the new owner. It is the right primitive for a
proprietary trading bot, a personal assistant trained on one user's
data, or any agent whose value is a secret worth owning.

## Why that's the wrong shape for an investigator

An investigator's job is to produce a signed report, over specific
evidence, that anyone can audit — its model identity, its reasoning,
and its track record are supposed to be maximally public, not encrypted.
Worse: if an investigator's identity *were* an ERC-7857 asset, someone
could buy a well-calibrated investigator's identity and quietly swap in
a different, worse model behind the same reputation — the identity
would keep accruing trust while the thing actually producing reports
changed underneath it, invisibly. That is precisely the "quiet
substitution" the whole calibration-history feature exists to make
impossible. Forcing ERC-7857 in here to use a 0G-branded primitive
would directly undermine the property Priority 2 was asking for.

## What was built instead

`contracts/contracts/InvestigatorRegistry.sol` — closer to an ERC-8004
Identity Registry than to ERC-7857: a persistent `investigatorId` that
survives key rotation (`rotateController`, so an operator can rotate
its signing key without losing accumulated calibration history),
records explicit version lineage (`parentId`, so a v2 model can be
registered as an explicit successor to a v1 investigator), and is
**not transferable** — there is no `transfer()` at all, deliberately.
`MemoryWarRegistry.submitReportAsIdentity` links a signed report to
this persistent identity only when the caller is verified as the
identity's *current* controller, so a rotated-away key can't forge
history onto an identity it no longer controls.

This was not a fallback taken because ERC-7857 was hard to integrate.
It was the correct call once the actual property being asked for
("identity persists independently from any individual investigation,
and accumulates a verifiable calibration history") turned out to
require the *opposite* of what ERC-7857 provides.
