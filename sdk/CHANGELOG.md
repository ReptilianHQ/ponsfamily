# Changelog

## Unreleased

- Require launch economics to be pinned by default and make the unpinned path
  an explicit unsafe opt-out.

## 0.1.0

This release line is available as `0.1.0-rc` on the `rc` channel before the
`v0.1.0` tag promotes the same version line to the stable `latest` channel.

- Publish intentionally public releases and fail on unexpected package visibility.
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
