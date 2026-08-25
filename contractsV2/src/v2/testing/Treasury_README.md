# Pons Treasury -- the $TREASURY standard

```
$TREASURY: 0xd0225586596b8231e4340e11ab50432a6424e660
```

Pons Treasury exists to give $TREASURY a real, recurring job: it is the
asset every opted-in Pons V2 launch accumulates a pooled balance of, and
spends only through a policy its own creator defines. This isn't a
generic "pick any asset" treasury with $TREASURY as one option among
many -- $TREASURY is hardcoded into the contract as `TREASURY_TOKEN`,
always an allowed treasury holding, and the asset every core function
(`enableTreasury`, `depositTreasury`, `withdrawForBuyback`) defaults to
when no asset is named. `$PONS` remains the ecosystem/protocol token;
$TREASURY is the asset the Treasury standard itself is built around and
runs on.

Core contract: [`PonsV2TreasuryStandard.sol`](./PonsV2TreasuryStandard.sol).

---

## 1. What problem this solves, and why $TREASURY

Pons V2 already lets a creator launch a token, raise capital on the
bonding curve, and graduate to a permanent liquidity pool, with the
protocol collecting a fee share split across protocol, creator, and
buyback via `PonsV2MemeHook` / `IPonsV2FeeEscrow` / `PonsV2BuybackVault`.
That fee share is typically spent immediately. Pons Treasury is the next
layer on top: a standard place for a launch's own revenue to accumulate
in $TREASURY and be deployed deliberately, rather than split and spent
the moment it arrives.

Every launch that opts in is, by construction, opting into $TREASURY:

- **Accumulation is denominated in $TREASURY by default.** A keeper
  forwarding a slice of a launch's fee share into its treasury lands in
  $TREASURY through the default funding path -- no asset needs to be
  named.
- **$TREASURY is always an allowed treasury asset.** No factory listing,
  no owner whitelist call -- `TREASURY_TOKEN` is allowed unconditionally.
- **Spend paths default to $TREASURY.** A buyback executor calling
  `withdrawForBuyback(token, amount, to)` spends $TREASURY unless it
  explicitly asks for a different asset.
- **Dashboards read $TREASURY directly.** `treasuryTokenBalance`,
  `treasuryTokenNAV`, and `totalTreasuryTokenFunded` expose a launch's
  $TREASURY position without threading an asset address through every
  call.

It is still a **standalone, opt-in module**, in the same spirit as
Ponsback: a launch that never wires it in costs nothing, and Treasury
never touches trading, graduation, or fee collection itself. Where
Ponsback pays *holders* proportionally to what they hold, Treasury pools
a balance -- in $TREASURY, by default -- at the *launch* level, spent
only through whatever policy that launch's creator has set.

## 2. Contract structure, top to bottom

### 2.1 Constants

| Name | Purpose |
|---|---|
| `TREASURY_TOKEN` | `0xd0225586596b8231e4340e11ab50432a6424e660` -- $TREASURY, this standard's canonical asset. Always an allowed treasury holding; every asset-taking function has an overload that resolves to it automatically. |
| `MAX_TREASURY_ASSETS_PER_LAUNCH` | Caps how many distinct assets one launch's treasury can ever hold (8), so per-launch accounting stays bounded. This bounds *additional* assets a launch chooses to hold alongside $TREASURY -- it is not a limit on $TREASURY itself. |

### 2.2 Errors & events

Standard custom-error-per-failure-mode style matching `PonsV2LaunchFactory`
and `PonsV2CashbackRewards`. Every state change that matters to an indexer
or a UI has a matching event: `TreasuryEnabled`, `TreasuryFunded`,
`TreasuryWithdrawn`, `TreasuryPolicySet`, `ExecutorUpdated`,
`AdminTransferred`, plus the two owner-config events. `TreasuryFunded` and
`TreasuryWithdrawn` both index the `asset` involved, so an indexer can
filter specifically for $TREASURY-denominated activity across every
launch.

### 2.3 State layout

- `factory` -- immutable pointer to the one `PonsV2LaunchFactory` this
  deployment trusts. Every launch-validity check (`.exists`) and the base
  treasury-asset whitelist (`.approvedPairTokens`) come from here.
- `treasuryEnabled[token]` -- one-time opt-in flag per launched token; also
  the flag for "this launch has opted into $TREASURY."
- `treasuryAdmin[token]` -- the sole address (normally the launch's
  creator) allowed to configure that launch's policy and executors.
  Transferable by the current admin.
- `treasuryPolicyOf[token]` -- `treasuryShareBps` (informational, typically
  the share of fees routed into $TREASURY) and `buybackEnabled` (the one
  switch this contract actually enforces).
- `treasuryBalance[token][asset]` -- the pooled balance itself.
  `treasuryBalance[token][TREASURY_TOKEN]` is a launch's $TREASURY
  position, also readable directly via `treasuryTokenBalance`. There is no
  per-holder split anywhere in this contract; a launch's treasury is one
  balance per asset, not a claimable stream.
- `authorizedExecutors[token][address]` -- per-launch addresses (e.g. a
  `PonsV2BuybackVault` instance) allowed to withdraw from that launch's
  treasury. Scoped per launch by that launch's own admin, unlike
  `authorizedFunders`, which is protocol-wide.
- `authorizedFunders` / `extraAllowedTreasuryAssets` -- owner-managed roles
  and whitelist extensions, mirroring Ponsback's equivalents. Neither
  affects $TREASURY, which is always allowed regardless.

### 2.4 Opt-in (`enableTreasury`)

A launched token calls this once, typically from its own constructor,
naming its creator as admin. The single-argument overload,
`enableTreasury(admin)`, is the expected path: it anchors the launch's
initial treasury asset to $TREASURY with nothing further to specify. The
two-argument form, `enableTreasury(admin, initialAsset)`, still exists for
a launch that deliberately wants to start on a different approved asset
instead. Both are verified against the factory, so a treasury can never be
spun up for an address that was never actually deployed as a launch. Admin
rights can later be handed off via `transferTreasuryAdmin`.

### 2.5 Funding (`depositTreasury`)

Only an `authorizedFunders` address can call this. The two-argument
overload, `depositTreasury(token, amount)`, funds in $TREASURY directly --
the expected path, since the protocol's forwarding keeper typically
routes a launch's fee share into $TREASURY upstream before it ever reaches
this contract. The three-argument form, `depositTreasury(token, asset,
amount)`, remains available for a launch also holding a second approved
asset. Either way, the contract pulls `amount` via `safeTransferFrom` and
measures what was actually received (defending against fee-on-transfer
assets silently under-crediting the treasury) before crediting
`treasuryBalance[token][asset]`.

Treasury deliberately does **not** know how to pull from
`IPonsV2FeeEscrow` or `PonsV2BuybackVault` itself, and does not know how
to swap into $TREASURY itself -- the protocol wires that up externally
(typically a keeper that periodically forwards a slice of a launch's fee
share, already converted to $TREASURY, here), so Treasury stays correct
regardless of exactly how fee accounting or the $TREASURY conversion
happens upstream.

### 2.6 Spending (`withdrawForBuyback`)

Only an address the launch's own admin has authorized as an executor for
that launch, and only while `buybackEnabled` is set, can move funds out.
The two-argument overload, `withdrawForBuyback(token, amount, to)`, spends
$TREASURY directly -- the expected path for a launch buying back its own
token with its accumulated $TREASURY. The three-argument form,
`withdrawForBuyback(token, asset, amount, to)`, remains available for a
second held asset. No swap or oracle logic lives in this contract -- an
executor such as `PonsV2BuybackVault` is responsible for what it does with
the asset once received. There is no owner sweep and no way for anyone
outside the launch's own configured executors to move a launch's treasury
balance.

### 2.7 Treasury asset whitelist

`isTreasuryAssetAllowed(asset)` is true if any of the following hold:
- it is `TREASURY_TOKEN` -- $TREASURY -- always allowed, unconditionally,
  with no factory listing or owner action needed;
- the factory already lists it as an `approvedPairToken` (so every asset a
  launch could have graduated against is usable for its treasury for
  free); or
- the owner added it via `setExtraTreasuryAssetAllowed` (for assets that
  were never meant to be a pair token, e.g. buyback proceeds).

`isTreasuryToken(asset)` is a narrower, pure helper that is true only for
`TREASURY_TOKEN` itself -- useful for a front end that wants to badge
$TREASURY balances distinctly from any other asset a launch's treasury
happens to also hold.

## 3. Integration checklist

1. Have the launched token call `enableTreasury(creator)` once, typically
   from its own constructor -- this anchors the launch's treasury to
   $TREASURY from the start. Pass an explicit `initialAsset` instead only
   if a launch deliberately wants to start on a different asset.
2. Grant `authorizedFunders` to whatever address will forward a slice of
   the launch's fee share -- ideally already converted to $TREASURY -- into
   its treasury.
3. As the launch's creator, call `setTreasuryPolicy` and `setExecutor` to
   turn on buybacks (or any other spend path) and name who is allowed to
   trigger them.
4. Point a dashboard at `treasuryTokenBalance` / `treasuryTokenNAV`
   alongside market cap and liquidity to show a launch's $TREASURY
   position; use `treasuryBalance` / `treasuryNAV` directly for any
   secondary asset a launch also holds.

## 4. Standard Launch vs. Treasury Launch

- **Standard Launch** -- a token, exactly as Pons V2 supports today. Costs
  nothing extra, touches nothing in this contract, holds no $TREASURY.
- **Treasury Launch** -- a token that additionally calls `enableTreasury`
  and configures a policy: a share of its revenue accumulates on-chain as
  $TREASURY in a standardized treasury, spendable only through
  creator-authorized executors (buybacks, or any future spend path built
  on the same `withdrawForBuyback` gate).

`$PONS` stays the ecosystem/protocol token; $TREASURY does not replace it.
But within the Treasury standard itself, $TREASURY is the canonical asset
every individual launch's own treasury is built on and anchored to, the
same way Ponsback is the standard each launch's own cashback is built on.

## 5. What Treasury deliberately does not do

- No price oracle, no swaps -- this contract only tracks and gates a
  balance; any conversion into $TREASURY happens upstream, and any
  conversion out of it happens inside whatever executor receives it.
- No automatic fee-escrow integration -- funding is authorization-gated,
  not hardcoded to one upstream contract's ABI.
- No per-holder claims -- a launch's treasury, including its $TREASURY
  balance, is a single pooled balance per asset, not a dividend stream.
- No owner sweep of treasury balances, $TREASURY included -- only a
  launch's own authorized executors can move its funds out, and only
  while that launch's policy permits it.
- Ownership cannot be renounced, mirroring `PonsV2LaunchFactory`'s and
  `PonsV2CashbackRewards`'s own stance: a contract holding launch-owned
  $TREASURY balances must always have a controlling address.

---

## Test launch template

Fill this in before deploying a test launch that wires up a treasury. It
doubles as the config both the launch transaction and the treasury
deployment script should read from.

```solidity
// ---- Test token -----------------------------------------------------
string  constant TEST_TOKEN_NAME     = "";        // e.g. "Ponstreasury"
string  constant TEST_TOKEN_SYMBOL   = "";        // e.g. "PTTEST"
string  constant TEST_TOKEN_LOGO     = "";        // URI
string  constant TEST_TOKEN_DESC     = "";
uint256 constant TEST_LAUNCH_CONFIG_ID = 0;       // id from factory.getLaunchConfig
address constant TEST_CREATOR_FEE_RECIPIENT = address(0); // 0 = deployer
uint16  constant TEST_CREATOR_TAX_BPS = 0;
bool    constant TEST_BUYBACK_ENABLED = false;

// ---- $TREASURY -----------------------------------------------------
// TREASURY_TOKEN is hardcoded in PonsV2TreasuryStandard.sol; it does not
// need to be whitelisted via setExtraTreasuryAssetAllowed, and every
// asset-taking function has an overload that resolves to it automatically.
// Kept here as a named constant purely for readability in this example.
address constant TREASURY = `CA`; // $TREASURY
uint256 constant TEST_TREASURY_FUNDING_AMOUNT = 0; // $TREASURY, in its own decimals

// ---- Deployed addresses (fill in after each step) ---------------------
address constant FACTORY_ADDRESS   = address(0); // PonsV2LaunchFactory
address constant TREASURY_ADDRESS  = address(0); // PonsV2TreasuryStandard
address constant LAUNCHED_TOKEN    = address(0); // filled in after launchToken()
```

Example wiring for this test token, once both contracts are deployed:

```solidity
// 1. Deploy the launch (see PonsV2LaunchFactory.launchToken / launchTokenNative).
// 2. From an address the Treasury owner has granted the funder role to:
treasury.setAuthorizedFunder(fundingKeeper, true);
// No setExtraTreasuryAssetAllowed call needed for $TREASURY: it is
// TREASURY_TOKEN, so it is always allowed.

// 3. The launched token opts itself in, naming its creator as admin
//    (normally done once in its own constructor). This anchors the
//    launch's treasury to $TREASURY with nothing further to specify:
//      PonsV2TreasuryStandard(TREASURY_ADDRESS).enableTreasury(creator);

// 4. The creator (treasury admin) configures policy and an executor,
//    e.g. a PonsV2BuybackVault instance:
treasury.setTreasuryPolicy(LAUNCHED_TOKEN, 500 /* 5% informational */, true);
treasury.setExecutor(LAUNCHED_TOKEN, buybackVault, true);

// 5. Fund the treasury in $TREASURY directly:
IERC20(TREASURY).approve(TREASURY_ADDRESS, TEST_TREASURY_FUNDING_AMOUNT);
treasury.depositTreasury(LAUNCHED_TOKEN, TEST_TREASURY_FUNDING_AMOUNT);

// 6. The authorized executor spends $TREASURY under policy:
treasury.withdrawForBuyback(LAUNCHED_TOKEN, amount, buybackVault);

// 7. Read the launch's $TREASURY position directly for a dashboard:
uint256 nav = treasury.treasuryTokenNAV(LAUNCHED_TOKEN);

// Explicit, multi-asset versions of steps 3/5/6 are still available if a
// launch ever wants to hold a second asset alongside $TREASURY (up to
// MAX_TREASURY_ASSETS_PER_LAUNCH total) -- just pass the asset address
// explicitly, e.g. treasury.depositTreasury(LAUNCHED_TOKEN, otherAsset, amount).
```
