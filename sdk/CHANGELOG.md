# Changelog

## 0.1.0

- Ship built output so production git installs never require development dependencies.
- Reject curve-buy receipts that spend more quote than the reviewed offer.
- Pin factory and value-carrying forwarder bytecode provenance.
- Validate exact event artifact signatures and indexing.
- Add reviewed Pons v2 factory, forwarder, curve, token, escrow, locker, and buyback-vault ABIs.
- Pin and verify the Robinhood Chain mainnet deployment.
- Add launch, atomic opening-buy, curve trade, approval, graduation, fee, and buyback builders.
- Add exact bigint curve quotes, public read helpers, and receipt verification.
- Export `BuybackLocked` event evidence and machine-readable mainnet provenance.
- Add deterministic Hegel property tests for curve arithmetic, price bounds, `uint256` behavior, and slippage invariants.
