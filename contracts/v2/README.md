# Pons v2 — Protocol Reference Implementation

Solidity implementation of the **pons v2** launch protocol, still not live for the public

## Architecture

```
                    ┌─────────────────────┐
                    │    LaunchFactory     │  entry point: launch configs,
                    │                      │  token+curve deployment,
                    └─────┬──────────┬─────┘  graduation, CTO governance
                          │          │
              deploys per launch    │ registers pool + reads fee policy
                          │          │
                 ┌────────▼───┐  ┌───▼────────┐
                 │ LaunchToken│  │  MemeHook  │  singleton Uniswap v4 hook
                 │ (fixed     │  │            │  charges the post-graduation
                 │  supply)   │  └───┬────────┘  trade fee, sweeps it out
                 └─────┬──────┘      │
                       │ minted to   │ locks buybacks / credits fees
                 ┌─────▼──────┐      │
                 │BondingCurve│      │
                 │ (per       │      │
                 │  launch)   │      │
                 └─────┬──────┘      │
                       │ at graduation
              ┌────────┴─────────────┴────────┐
              │                                │
        ┌─────▼──────┐                  ┌──────▼─────┐
        │ FeeEscrow  │                  │BuybackVault│
        │ (pull-based│                  │ (5yr linear│
        │  claims)   │                  │  vesting)  │
        └────────────┘                  └────────────┘

        LaunchLocker: receives the graduation LP position and any excess
        supply. Exposes no withdrawal function of any kind.
```

| Contract | File | Role |
|---|---|---|
| `LaunchFactory` | `contracts/LaunchFactory.sol` | Entry point. Launch configs, deploys per-launch contracts, drives graduation, community takeover governance. |
| `BondingCurve` | `contracts/BondingCurve.sol` | One per launch. Constant-product pricing with a virtual "phantom" quote reserve — see below. |
| `LaunchToken` | `contracts/LaunchToken.sol` | One per launch. Fixed-supply ERC-20, minted entirely to its curve. |
| `MemeHook` | `contracts/hook/MemeHook.sol` | Singleton Uniswap v4 hook. Charges and sweeps the post-graduation trade fee. |
| `FeeEscrow` | `contracts/FeeEscrow.sol` | Pull-based balances in ETH and any ERC-20, so no bad recipient can jam a sweep. |
| `BuybackVault` | `contracts/BuybackVault.sol` | Holds bought-back supply, releases it linearly over 5 years with a weighted vesting start. |
| `LaunchLocker` | `contracts/LaunchLocker.sol` | Permanently holds the graduation LP position and any excess supply. No withdrawal path exists. |

## The bonding curve, precisely

The docs give two facts that pin down the entire pricing model:

1. `reservedTokens = supply × phantomQuote ÷ (phantomQuote + graduationThreshold)`
2. "Both forms of graduation progress agree by construction" — quote raised
   vs. threshold, and tokens sold vs. sellable supply, are the same number.

Both facts fall out of a constant-product invariant with a virtual
("phantom") offset on the quote side only:

```
k             = phantomQuote × totalSupply           (fixed at creation)
quoteReserve  = phantomQuote + realQuoteReserve       (x)
tokenReserve  = tokens still held by the curve        (y)
invariant:      x × y == k, at every trade
```

At creation, `x₀ = phantomQuote`, `y₀ = totalSupply`, so `k = phantomQuote ×
totalSupply`. At the moment `realQuoteReserve` reaches `graduationThreshold`,
`x = phantomQuote + threshold` and therefore `y = k / x = totalSupply ×
phantomQuote / (phantomQuote + threshold)` — exactly `reservedTokens`. See
the NatSpec on `BondingCurve` for the full derivation and the buy/sell/
graduation code that follows from it directly.

## Known simplifications (read before relying on this)

- **`MemeHook.sweep`'s internal conversion swap** drives the raw
  `PoolManager.unlock/settle` flow directly, with a naive spot-price-impact
  check (`_tryConvert`) that swaps first and only then checks the price
  moved less than the pool's cap — a production sweeper should quote
  off-chain before committing to the swap. This is exactly the kind of path
  the three audits referenced in the pons docs exist to scrutinize.
- **`LaunchFactory.rescueLaunch`** returns the swept quote to the launch's
  original deployer as a simple, auditable stand-in for "give it back." The
  docs describe this as a fallback for a launch stuck mid-graduation without
  specifying a mechanism; a fair implementation would refund each buyer
  proportional to their historical net contribution, which needs a
  per-buyer accounting layer this repo leaves out to keep `BondingCurve`'s
  storage minimal.
- **Hook address mining.** Uniswap v4 decides which callbacks to invoke by
  reading flag bits out of a hook's own deployed address. A real deployment
  needs `MemeHook`'s address mined (CREATE2 salt search) to match
  `getHookPermissions()`; that step is called out but not implemented in
  `scripts/deploy.js`.
- **`LaunchFactory`'s constructor-time address prediction** in
  `scripts/deploy.js` uses a nonce offset, which is fragile — swap it for a
  deterministic deployer (e.g. a CREATE2 factory) before using this against
  a real network.

## License

MIT — see `LICENSE`. The Uniswap v4 core interfaces this repo imports
(`@uniswap/v4-core`) remain under their own BUSL-1.1 / MIT terms as declared
in that package; nothing from it is copied here beyond ordinary `import`
statements.
