# Ponsback

Holdings-based cashback rewards for Pons V2 launched tokens. Holders of a
launch earn a share of a protocol-funded reward pool proportional to how
much of the token they hold, and can claim that cashback in whichever
approved token they prefer (e.g. USDG), independent of what asset the
launch itself trades against.

Core contract: [`PonsV2CashbackRewards.sol`](./PonsV2CashbackRewards.sol).

---

## Test launch template

Fill this in before deploying a test launch that wires up Ponsback. It
doubles as the config both the launch transaction and the cashback
deployment script should read from.

```solidity
// ---- Test token -----------------------------------------------------
string  constant TEST_TOKEN_NAME     = "";        // e.g. "Ponsback"
string  constant TEST_TOKEN_SYMBOL   = "";        // e.g. "PBTEST"
string  constant TEST_TOKEN_LOGO     = "";        // URI
string  constant TEST_TOKEN_DESC     = "";
uint256 constant TEST_LAUNCH_CONFIG_ID = 0;       // id from factory.getLaunchConfig
address constant TEST_CREATOR_FEE_RECIPIENT = address(0); // 0 = deployer
uint16  constant TEST_CREATOR_TAX_BPS = 0;
bool    constant TEST_BUYBACK_ENABLED = false;

// ---- Reward asset for this example -----------------------------------
address constant USDG = 0x5fc5360d0400a0fd4f2af552add042d716f1d168; // fill in per chain
uint256 constant TEST_CASHBACK_FUNDING_AMOUNT = 0; // USDG, in its own decimals

// ---- Deployed addresses (fill in after each step) ---------------------
address constant FACTORY_ADDRESS   = address(0); // PonsV2LaunchFactory
address constant CASHBACK_ADDRESS  = address(0); // PonsV2CashbackRewards
address constant LAUNCHED_TOKEN    = address(0); // filled in after launchToken()
```

Example wiring for this test token, once both contracts are deployed:

```solidity
// 1. Deploy the launch (see PonsV2LaunchFactory.launchToken / launchTokenNative).
// 2. From an address the Ponsback owner has granted the funder role to:
cashbackRewards.setAuthorizedFunder(fundingKeeper, true);
cashbackRewards.setExtraRewardTokenAllowed(USDG, true); // no-op if USDG is already an approved pair token

// 3. The launched token opts itself in (normally done once in its own constructor):
//      PonsV2CashbackRewards(CASHBACK_ADDRESS).enableTracking();

// 4. Holders sync themselves once if they held tokens before enableTracking():
cashbackRewards.register(LAUNCHED_TOKEN); // called by the holder, msg.sender = holder

// 5. Fund the pool in USDG:
IERC20(USDG).approve(CASHBACK_ADDRESS, TEST_CASHBACK_FUNDING_AMOUNT);
cashbackRewards.depositReward(LAUNCHED_TOKEN, USDG, TEST_CASHBACK_FUNDING_AMOUNT);

// 6. A holder chooses USDG as their default and claims:
cashbackRewards.setPreferredRewardToken(LAUNCHED_TOKEN, USDG);
cashbackRewards.claimPreferred(LAUNCHED_TOKEN);
```

---

## 1. What problem this solves

Pons V2 launches trade against a pair token (native ETH or an approved
ERC-20), and the protocol collects a fee share on every trade via
`PonsV2MemeHook` / `IPonsV2FeeEscrow`. Ponsback gives the protocol a place
to redirect a slice of that fee share back to a launch's own holders, paid
out in a token of each holder's choosing rather than only in the launch's
pair asset.

It is a **standalone, opt-in module**: a launch that never wires it in
costs nothing, and Ponsback never touches trading, graduation, or fee
collection itself.

## 2. Contract structure, top to bottom

### 2.1 Constants

| Name | Purpose |
|---|---|
| `MAGNITUDE` | Fixed-point scale (`2**128`) for the reward-per-share accumulator. Same technique used by long-established dividend-paying-token designs. |
| `MAX_REWARD_TOKENS_PER_LAUNCH` | Caps how many distinct reward tokens one launch can ever be funded in (12), because every tracked balance change loops over that list once. |

### 2.2 Errors & events

Standard custom-error-per-failure-mode style matching `PonsV2LaunchFactory`.
Every state change that matters to an indexer or a UI has a matching event:
`TrackingEnabled`, `BalanceSynced`, `RewardDeposited`, `RewardClaimed`,
`PreferredRewardTokenSet`, plus the two owner-config events.

### 2.3 State layout

- `factory` — immutable pointer to the one `PonsV2LaunchFactory` this
  deployment trusts. Every launch-validity check (`.exists`) and the base
  reward-token whitelist (`.approvedPairTokens`) come from here.
- `trackingEnabled[token]` — one-time opt-in flag per launched token.
- `trackedBalanceOf[token][holder]` / `trackedSupplyOf[token]` — Ponsback's
  own mirror of holder balances. This is *not* the same as the token's real
  `balanceOf`/`totalSupply`: it only reflects holders who have been synced
  at least once, either by the push hook or manually.
- `magnifiedRewardPerShare[token][rewardToken]` — the accumulator each
  `depositReward` call increments.
- `_magnifiedCorrections[token][rewardToken][holder]` — the signed
  per-holder correction that makes a balance change not retroactively
  change what was already owed for past deposits.
- `withdrawnRewards[token][rewardToken][holder]` — cumulative claims, so
  `pendingReward` only ever reports what's left.
- `preferredRewardToken[token][holder]` — UX default for `claimPreferred`;
  never restricts what `claim` can target.
- `authorizedFunders` / `extraAllowedRewardTokens` — owner-managed roles
  and whitelist extensions.

### 2.4 Balance tracking: two ways in

Ponsback never assumes it knows a holder's balance; it has to be told.

- **Push (`onTokenTransfer`)** — the launched token calls this on every
  mint/burn/transfer. Exact, real-time, and the *only* mechanism that keeps
  Ponsback fully in sync automatically. It is intentionally cheap: no
  external calls out of Ponsback happen inside it, so it can't be made to
  revert by anything other than Ponsback's own bookkeeping.
- **Pull (`sync` / `register`)** — permissionless; re-reads the real
  `balanceOf` and reconciles. This is the fallback for holders who held
  balance before `enableTracking()` was called, or for a launch that was
  never wired with the push hook at all.

Both paths funnel through the same private `_applyBalance`, so the
accounting is identical no matter which one triggered it.

### 2.5 Funding (`depositReward`)

Only an `authorizedFunders` address can call this. It pulls `amount` of
`rewardToken` from the caller via `safeTransferFrom`, measures what was
actually received (defends against fee-on-transfer tokens silently
under-crediting the pool), and divides it across every currently tracked
holder by incrementing `magnifiedRewardPerShare[token][rewardToken]` by
`received * MAGNITUDE / trackedSupplyOf[token]`.

Ponsback deliberately does **not** know how to pull from
`IPonsV2FeeEscrow` or `PonsV2MemeHook` itself — the protocol wires that up
externally (typically a keeper that periodically withdraws the protocol's
fee share and forwards a slice here), so Ponsback stays correct regardless
of exactly how fee accounting works upstream.

### 2.6 Claiming

- `claim(token, rewardToken)` — claims everything owed in one specific
  reward token, whether or not it's the caller's stated preference.
- `claimPreferred(token)` — same thing, targeting
  `preferredRewardToken[token][msg.sender]`.

Both compute `pendingReward` (accumulated minus already withdrawn) and pay
it out directly — no swap, no oracle, no conversion. A reward-token pool
only ever pays out exactly what was deposited into it.

### 2.7 Reward token whitelist

`isRewardTokenAllowed(rewardToken)` is true if either:
- the factory already lists it as an `approvedPairToken` (so every asset a
  launch could have graduated against is usable for cashback for free), or
- the owner added it via `setExtraRewardTokenAllowed` (for assets that were
  never meant to be a pair token, e.g. a protocol governance token).

## 3. Integration checklist

1. Add one line to the launched token's `_update` override — a
   result-ignoring low-level call into `onTokenTransfer` — so token
   transfers keep working even if Ponsback is paused, unfunded, or not
   deployed for that launch.
2. Have the token call `enableTracking()` once, typically from its own
   constructor.
3. Grant `authorizedFunders` to whatever address will actually forward the
   protocol's fee share.
4. Backfill pre-existing holders with `sync`/`register` if the token
   already had holders before step 2.

## 4. What Ponsback deliberately does not do

- No price oracle, no swaps — reward pools only pay out what was literally
  deposited in that token.
- No automatic fee-escrow integration — funding is authorization-gated,
  not hardcoded to one upstream contract's ABI.
- No owner sweep of deposited rewards — once funded, a pool can only leave
  via a holder's own `claim`.
- Ownership cannot be renounced, mirroring `PonsV2LaunchFactory`'s own
  stance: a contract holding user-claimable balances must always have a
  controlling address.
