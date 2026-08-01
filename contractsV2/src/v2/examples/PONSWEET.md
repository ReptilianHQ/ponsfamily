# Ponsweet ($PONSWEET)

### The official mascot of ponsfamily.com

![Ponsweet](./ponsweet.jpg)

> "He carries the whole house on his head, so nothing you launch can fall on him."

> This is a walkthrough README. Its purpose is to explain, step by step and using $PONSWEET as the example, how a launch on ponsfamily.com actually works from creation through graduation.

---

## 1. Who He Is

Ponsweet is the official mascot of ponsfamily.com, and he has never once left the door open behind him.

Not a placeholder, not a temporary face, not one option among several. Ponsweet is the mascot, the one that represents ponsfamily.com everywhere the brand shows up. A small, soft, felt-grey figure with a green pitched roof grown straight out of his head, chimney included, a thin curl of smoke still rising from it because someone is always home. Thick black square glasses sit heavy on his face, the kind worn by whoever actually reads the contract before signing it. He does not shout, he does not pitch, he does not perform. He stands there, warm light behind him, and lets you notice that he is already built, already sealed, already lived in.

The roof is the point. Ponsweet is not a creature holding a house. He is the house. Whatever gets launched under his name gets launched under a roof that was finished before anyone showed up.

---

## 2. The Look

Everything about Ponsweet says the same thing from a different angle.

The green roof means shelter that was designed in, not bolted on afterwards. The lit chimney means the thing is inhabited: someone maintains it, someone keeps the fire going, it is not a facade with nothing behind the front wall. The heavy black glasses mean he reads the fine print, every parameter, every limit, every line, before anything moves. The felt texture, the slightly worn stitching, the faint film-grain and soft glow around him mean he has been here a while and has been handled, and is still in one piece.

He is not drawn to look cute so you will trust him. He is drawn to look like a place, somewhere that holds when the weather turns. That is exactly why he is the one representing ponsfamily.com and not someone else.

---

## 3. What He Represents

Ponsweet is the face of a launch that already has a roof on it, and as the official mascot, that is the standard the whole ecosystem gets measured against.

He is the protection that exists before the first trade, not after the first exploit. He is the closed door during the dangerous hour. He is the difference between a project that promises safety and a project where safety was poured into the foundation and cannot be removed by hand. He is unbothered by noise, unmoved by promises, and completely uninterested in whatever everyone else is currently losing their mind over.

He does not get drained. Not because he is lucky, but because there is no gap between the walls and the roof for anything to get in through. Liquidity, limits, and permissions all go up in the same motion as the building itself. That is the reputation ponsfamily.com wanted standing at the front, so that is who stands at the front.

---

## 4. Launch Walkthrough (V2, Example)

This section explains, phase by phase, how a **V2** launch on ponsfamily.com actually works. $PONSWEET is used purely as the example token, so every stage below can be followed in order, one step at a time. V2 replaces the old "deploy straight into a pool" model with a bonding curve that graduates into a Uniswap V4 pool, so there is no early window left for anyone to snipe.

### Step 1: Creation

The creator submits `TokenParams`: name, symbol, logo, description, the five social fields, the `creatorFeeRecipient`, an optional `creatorTaxBps` on top of the config's base `curveFeeBps`, whether `buybackEnabled` starts on, and an `expectedEconomics` digest. That digest comes from `previewLaunchEconomics(launchConfigId, pairToken)` and pins ten terms at once (phantom quote, graduation threshold, supply, curve fee, pool fee, tick spacing, protocol fee share, buyback burn share, hook fee, max internal price impact). If the protocol owner re-pegs anything while the launch is in flight, the transaction reverts with `LaunchEconomicsMismatch` instead of landing on different terms. Ponsweet reads the terms before the first beam goes up, and so does this step.

### Step 2: Deployment

`launchToken(params, launchConfigId, pairToken)` runs the whole thing in one call. The factory validates the config and the quote asset (`pairToken` zero means native ETH, otherwise it must be approved and have registered `PairTokenEconomics` for its own decimals), collects the launch fee, then routes through `PonsV2LaunchDeployer` to deploy the `PonsV2BondingCurve` and the `PonsV2LauncherToken`. The record is written to `LaunchedToken` and `TokenLaunched` is emitted. Nothing here is improvised.

### Step 3: Supply Goes to the Curve, Not a Pool

The token's **entire fixed supply mints directly to its bonding curve** in the constructor. There is no LP position at launch, no dev allocation, no seed wallet to watch. `deployer` is stored as immutable attribution data only and confers zero privileges over the token. Then `initialize(token)` arms the curve. Walls and roof go up in the same motion.

### Step 4: Curve Trading

Trading happens against the curve itself: `buy(quoteIn, minTokensOut, recipient)` and `sell(tokensIn, minQuoteOut, recipient)` on a constant-product curve seeded with a phantom quote reserve. Anyone, the deployer included, can buy any size at any time — the curve's own price impact and its reserved pool allocation are the only limits, so there is no privileged first buyer and nothing for a sniper to front-run. Fees are always charged on the **quote leg** whatever the direction, so protocol and creator revenue is quote-denominated from the very first trade and the curve never accrues memecoin-denominated fees. Total trade fee is hard-capped at 20% (`MAX_TOTAL_TRADE_FEE_BPS`), and `creatorTaxBps` is capped at launch time by `maxCreatorTaxBps`.

### Step 5: Fee Sweeps

`sweepFees(minBuybackTokensOut)` splits accrued fees under the live `FeePolicySnapshot`: the protocol share to `protocolFeeRecipient`, the creator share plus the full creator tax to `creatorFeeRecipient`, both credited through `PonsV2FeeEscrow` (`claim` / `claimToken`), and the `buybackBurnBps` slice spent buying the token back on its own curve. Bought-back tokens are **not burned** — they get locked into `PonsV2BuybackVault` on a five-year vest (`lock`, `release`, `releasable`, `vestingTerms`). `ERC20Burnable` exists on the token, but only so a holder can voluntarily burn their own balance.

### Step 6: Graduation

`readyToGraduate()` becomes true once real quote reserves cross `graduationThreshold`, read straight from chain state — no approval, no discretion. A trade that crosses the line can auto-trigger it (`_tryAutoGraduate`), or anyone can call `graduate(token)` on the factory. The curve is swept, then `graduate(recipient)` hands over quote and tokens, and the launch moves through `GraduationPhase`: `NotGraduated` → `Swept` → `PoolCreated`. Because the curve collected the exact asset the pool will use, seeding needs no swap and therefore **no price oracle anywhere in the system**.

### Step 7: The Graduated Pool

`createGraduatedPool(token)` opens the Uniswap V4 pool at the snapshotted `poolFee` / `tickSpacing`, `PonsV2GraduationGuard.assertSeedable(...)` refuses a seed that isn't viable, and `PonsV2GraduationExecutor.mintFullRangePosition(...)` mints a full-range position and sweeps its own dust. The position is then handed to `PonsV2LaunchLocker.lockPosition(...)` and any excess supply to `lockTokenSupply(...)` — permanently. `PoolGraduated` and `GraduationTokensPermanentlyLocked` are emitted. The roof is nailed down and there is no ladder back up.

### Step 8: Post-Graduation Life

From here `PonsV2MemeHook` runs the same economics on the live pool as the curve did: `_afterSwap` collects the hook fee and creator tax, `sweepPoolFees(poolId, minConversionQuoteOut, minBuybackTokensOut)` converts, distributes and feeds the same buyback vault, bounded by `maxInternalPriceImpactBps`. Both phases read one `currentFeePolicy()`, so nothing about the deal changes the moment the pool opens.

### Step 9: Reference Point

After graduation, $PONSWEET stands as a complete, observable example of the whole V2 lifecycle from first mint to locked position, the same way Ponsweet has always stood: roof on, chimney lit, glasses on, nothing left open.

---

## 5. Contract Technical Reference (contractsV2)

$PONSWEET is created and managed by the same production **V2** contracts that power every launch on ponsfamily.com (`contractsV2/src/v2`). There's no special logic hiding underneath the branding. It demonstrates the exact same lifecycle every token on the platform goes through.

### 5.0 The Contract Set

| Contract | Role |
|---|---|
| `PonsV2LaunchFactory` | Orchestrates the launch, owns launch configs and quote-asset economics, drives graduation |
| `PonsV2LaunchDeployer` | Deploys token + curve on the factory's behalf (keeps factory bytecode under the EIP-170 limit) |
| `PonsV2LauncherToken` | Fixed-supply ERC-20, `ERC20Burnable`, entire supply minted to its curve |
| `PonsV2BondingCurve` | Constant-product curve, quote-leg fees, sweeps, graduation handoff |
| `PonsV2MemeHook` | Uniswap V4 hook applying the same fee policy to the graduated pool |
| `PonsV2BuybackVault` | Five-year vest for bought-back tokens |
| `PonsV2GraduationExecutor` | Mints the full-range V4 position and sweeps residual dust |
| `PonsV2GraduationGuard` | Refuses a non-viable graduation seed |
| `PonsV2LaunchLocker` | Permanently locks the LP position and excess supply |
| `PonsV2BondingCurveMath` / `PonsV2GraduationMath` | Pure math libraries for curve pricing and graduation sizing |

### 5.1 PonsV2LaunchFactory: Launch Orchestration

| Function | Role for $PONSWEET |
|---|---|
| `launchToken(TokenParams, launchConfigId, pairToken)` | Deploys $PONSWEET and its curve, mints supply to the curve, records the launch, atomically |
| `previewLaunchEconomics(launchConfigId, pairToken)` | Returns the `expectedEconomics` digest the creator pins at signing time |
| `getLaunchConfig(id)` / `launchConfigCount()` | Reads the supply, `curveFeeBps`, `phantomQuote`, `graduationThreshold`, `poolFee`, `tickSpacing` in force |
| `getLaunchFeePolicy(token)` | Returns the `FeePolicySnapshot` the launch trades under |
| `getLaunchedToken(token)` | Returns the permanent `LaunchedToken` record and current `GraduationPhase` |
| `graduate(token)` | Sweeps the curve and completes it once the threshold is crossed |
| `createGraduatedPool(token)` | Creates the Uniswap V4 pool, mints the position, locks it |
| `transferCreatorFeeRecipient(token, newRecipient)` | Lets the creator hand off fee rights |
| `setBuybackEnabled(token, enabled)` | Per-launch buyback-and-lock switch |
| `addLaunchConfig` / `updateLaunchConfig` / `setLaunchFee` | Protocol-owner configuration surface |
| `setPairTokenApproved` / `setPairTokenEconomics` | Approves an ERC-20 quote asset and registers its decimals-correct economics |
| `setLaunchEnabled` / `setWhitelistedLauncher` / `setMaxCreatorTaxBps` | Protocol-level launch permissions and caps |

### 5.2 PonsV2LauncherToken: Token Behavior

| Function | Role for $PONSWEET |
|---|---|
| `constructor(...)` | Mints the entire fixed supply to `curve` and stores logo, description and socials |
| `deployer` / `launchFactory` / `curve` | Immutable references; `deployer` is attribution only, with no privileges |
| `socials()` / `getTokenInfo()` | Returns the metadata used throughout the documentation examples |
| `burn` / `burnFrom` (`ERC20Burnable`) | Voluntary holder burn only — the protocol's buyback locks instead of burning |

### 5.3 PonsV2BondingCurve: Pre-Graduation Market

| Function | Role for $PONSWEET |
|---|---|
| `initialize(token)` | Arms the curve for its token, factory-only |
| `buy(quoteIn, minTokensOut, recipient)` / `sell(tokensIn, minQuoteOut, recipient)` | Open trading with slippage bounds, no privileged buyer |
| `getReserves()` / `quoteReserve()` / `realQuoteReserve()` / `tokenReserve()` / `sellableTokens()` | Live curve state, phantom versus real quote |
| `readyToGraduate()` | Threshold check straight from chain state |
| `sweepFees(minBuybackTokensOut)` | Splits protocol / creator / buyback, credits the escrow, buys back and locks |
| `graduate(recipient)` | Hands quote and tokens to the factory for pool seeding, factory-only |
| `isNativeQuote()` | Whether the quote leg is ETH or the configured ERC-20 |

### 5.4 Fees, Buyback and Graduation Plumbing

| Function | Role for $PONSWEET |
|---|---|
| `IPonsV2FeePolicy.currentFeePolicy()` | One `FeePolicySnapshot` (`protocolFeeShareBps`, `buybackBurnBps`, `hookFeeBps`, `maxInternalPriceImpactBps`) shared by curve and hook |
| `IPonsV2FeeEscrow.claim()` / `claimToken(token)` | How the protocol and the creator actually withdraw their swept fees |
| `PonsV2MemeHook._afterSwap` / `sweepPoolFees(...)` | Post-graduation fee collection and distribution on the V4 pool |
| `PonsV2BuybackVault.lock` / `release` / `releasable` / `vestingTerms` | Five-year vest of bought-back $PONSWEET |
| `PonsV2GraduationGuard.assertSeedable(...)` | Blocks a graduation seed that isn't viable at the chosen tick spacing |
| `PonsV2GraduationExecutor.mintFullRangePosition(...)` | Mints the full-range position and sweeps residual dust |
| `PonsV2LaunchLocker.lockPosition(token, tokenId)` / `lockTokenSupply(token, amount)` / `isLocked(token)` | Permanent lock of the LP position and any excess supply |

---

## 6. Why It Matters

$PONSWEET serves several purposes at once. As the official mascot token, it's the canonical example and reference point used throughout ponsfamily.com. It's a developer education tool showing the complete lifecycle start to finish. It's a reference implementation that every SDK, tutorial, guide, and integration can point back to. It's useful for regression testing, since future protocol versions can recreate $PONSWEET to check behavioral compatibility. It helps validate infrastructure, since lockers, launch configurations, DEX integrations, and protocol upgrades can all be tested against one known reference. And above all, it carries the face ponsfamily.com put forward as its own.

---

## 7. The Future of $PONSWEET

To be completely clear about what this is: $PONSWEET is the official mascot and documentation token of ponsfamily.com. It has no holder utility. It's not meant for speculation. Its purpose is to be the permanent identity, and reference point, the ecosystem is built around.

Every tutorial, every guide, every SDK example, every frontend, every explorer, every audit, every future launch can all point back to one complete, canonical example, with one roof, one lit chimney, one pair of glasses, sealed the whole time.

$PONSWEET.

---

> "Every launch needs a roof. He is the roof."

**Ponsweet ($PONSWEET)**

The official mascot of ponsfamily.com.