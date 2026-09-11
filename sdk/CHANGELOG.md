# Changelog

## 0.6.1

- Expose Pons factory configuration and approved pair-asset events for indexed,
  event-driven launch-term projections.

## 0.6.0

- Read pair-specific launch terms and preserve raw state during metadata outages.
- Support allowance revocation and verify unique matching events in batched receipts.



## 0.5.1

- 2026-09-10: Support approved pairing assets and atomic ERC20 opening buys.


- Fix generated Envio handler discovery so selected pool indexing starts and reorgs recover.

## 0.5.0

- Compose verified Pons pools with shared v4 indexing without subscribing to unrelated pools.
- Require Node 24 and explicit pool selection for indexing manifest v2.

- Strengthen receipt verification coverage with named fields, adversarial logs, and atomic launch boundaries.

## 0.4.1

### 2026-09-09

- Index configuration updates so consumers can preserve launch-block economics without repeated RPC reads.

## 0.4.0

- Read graduated V4 custody and pool facts without embedding portfolio policy.

- Verify published tarball bytes and prevent stale retries from moving channels backwards.

### 2026-09-08

- Generate indexing artifacts from one reviewed protocol catalog to prevent drift.
- Preserve canonical event provenance and reusable launch and pool evidence.
- Keep the pinned Envio starter outside the published SDK surface.

- Pin one finalized Robinhood Chain receipt per verifier as deployment-bound integration evidence.
- Extend Hegel properties to every receipt verifier (acceptance, per-field mismatch, wrong emitter, reverted, floors) and to every builder's calldata verification.
- Add Hegel construction round-trip and calldata perturbation properties for transaction builders.

## 0.3.1

- Standardize immutable numbered candidates and provenance-bound stable promotion.

## 0.3.0

- Bound SDK CI and publishing runtimes while canceling superseded verification runs.
- Add a typed, versioned Pons indexing manifest with reviewed events, fixed and
  dynamic sources, runtime hashes, and the Uniswap V4 PoolManager dependency.
- Export Envio artifacts for launched-token transfers and PoolManager swaps.
- Add deterministic graduated-pool swap orientation and historical launch
  indexing snapshot reads.
- Expand the Envio example to capture every reviewed Pons event in a normalized,
  bigint-safe envelope while retaining typed launch identity and supply.

## 0.2.0

- Add persistence-neutral reserve accounting and launch-lifecycle projection helpers.

## 0.1.1

- Require launch economics to be pinned by default and make the unpinned path
  an explicit unsafe opt-out.
- Require stable tags to match the immutable commit recorded by the published RC.
- Document authenticated GitHub Packages installs and the complete RC-to-stable workflow.
- Enforce intentionally public package visibility after every publication.
- Validate release documentation against source and workflow-generated RC manifests.

## 0.1.0

This release line is available as `0.1.0-rc` on the `rc` channel before the
`v0.1.0` tag promotes the same version line to the stable `latest` channel.

- Publish release-candidate branches and stable tags to GitHub Packages with
  validated versions and separate `rc` and `latest` install channels.
- Add a canonical Envio mainnet example with fixed-source provenance, dynamic
  curve/token registration, and exact full-supply mint projection.
- Complete the Envio factory and curve artifacts with every event already
  present in the reviewed consumer ABI.
- Mark the publicly visible SDK package as unlicensed.
- Verify immutable production Git installs and runtime imports in CI.
- Add graduated-pool fees, escrow claims, buyback vesting, and receipt evidence.
- Commit build artifacts so production git installs do not require development dependencies.
- Reject curve-buy receipts that spend more quote than the reviewed offer.
- Pin factory and value-carrying forwarder bytecode provenance.
- Validate exact event artifact signatures and indexing.
- Add reviewed Pons v2 factory, forwarder, curve, token, escrow, locker, and buyback-vault ABIs.
- Pin and verify the Robinhood Chain mainnet deployment.
- Add launch, atomic opening-buy, curve trade, approval, graduation, fee, and buyback builders.
- Add exact bigint curve quotes, public read helpers, and receipt verification.
- Export `BuybackLocked` event evidence and machine-readable mainnet provenance.
- Add deterministic Hegel property tests for curve arithmetic, price bounds, `uint256` behavior, and slippage invariants.
