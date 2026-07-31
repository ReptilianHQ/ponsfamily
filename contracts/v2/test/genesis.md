# Pons V2 — Genesis

> **The first token ever launched by Pons using the Pons V2 architecture.**

<p align="center">
  <strong>Bonding Curve → Graduation → Uniswap v4 → Fee Infrastructure → Buyback → Vesting</strong>
</p>

<p align="center">
  The first Genesis launch built to demonstrate the complete Pons V2 lifecycle — from initial token creation to post-graduation trading, buyback infrastructure and locked supply.
</p>

---

> [!IMPORTANT]
>
> ## The First Pons V2 Genesis Launch
>
> **Pons V2 Genesis is the first token ever launched by Pons using the V2 launch architecture.**
>
> It represents the first public, concrete instance of the Pons V2 system operating across its complete launch lifecycle.
>
> The Genesis launch demonstrates how the architecture connects:
>
> **LaunchFactory → LaunchToken → BondingCurve → Graduation → Uniswap v4 → MemeHook → FeeEscrow → Buyback Infrastructure → BuybackVault → Vesting**
>
> The Pons V2 deployment is at:
>
> ```text
> 0x0d49ee0a6e38489e6b291181846bea11804551ee
> ```
> The Genesis deployment also exposes the protocol's designated **Buyback Wallet**:
>
> ```text
> 0x30038cba4f728e90c6b7e92924fe2a7b267e4e19
> ```
>
> This address forms part of the buyback infrastructure demonstrated by the Genesis launch and provides a publicly observable destination associated with the protocol's buyback flow.

---

> [!WARNING]
>
> ## Genesis Disclaimer
>
> **Pons V2 Genesis is a test token created exclusively for demonstration, experimentation and documentation purposes.**
>
> It has **no intrinsic utility** and should not be interpreted as an official production token, financial instrument, investment opportunity or representation of future protocol functionality.
>
> The fact that Genesis is the **first token launched through Pons V2** does not change its purpose as a technical demonstration.
>
> The goal of this Genesis example is to provide a concrete, onchain representation of how the **Pons V2 launch architecture** is designed to operate.
>
> The token demonstrates:
>
> * Fixed-supply token deployment
> * Bonding-curve trading
> * Phantom quote reserves
> * Launch fees
> * Creator fees
> * Protocol fee allocation
> * Buyback configuration
> * Buyback wallet infrastructure
> * Graduation mechanics
> * Uniswap v4 pool creation
> * Post-graduation trading fees
> * Fee escrow
> * Buyback supply locking and vesting
> * Permanently locked liquidity
>
> This is a **technical demonstration of the architecture**, not a production deployment.

---

## Contents

* [01 — Pons V2 at a Glance](#01--pons-v2-at-a-glance)
* [02 — Genesis Architecture](#02--genesis-architecture)
* [03 — The Genesis Token](#03--the-genesis-token)
* [04 — Launch Creation](#04--launch-creation)
* [05 — Fixed Supply](#05--fixed-supply)
* [06 — The Bonding Curve](#06--the-bonding-curve)
* [07 — Phantom Quote Reserve](#07--phantom-quote-reserve)
* [08 — Buying From the Curve](#08--buying-from-the-curve)
* [09 — Oversized Buys & Graduation](#09--oversized-buys--graduation)
* [10 — Fee Architecture](#10--fee-architecture)
* [11 — Buyback Architecture](#11--buyback-architecture)
* [12 — The Buyback Wallet](#12--the-buyback-wallet)
* [13 — Buyback Vesting](#13--buyback-vesting)
* [14 — FeeEscrow](#14--feeescrow)
* [15 — Graduation](#15--graduation)
* [16 — Uniswap v4 Integration](#16--uniswap-v4-integration)
* [17 — Post-Graduation Buyback Flow](#17--post-graduation-buyback-flow)
* [18 — LaunchLocker](#18--launchlocker)
* [19 — LaunchLocker Excess Supply](#19--launchlocker-excess-supply)
* [20 — Token Metadata](#20--token-metadata)
* [21 — Solidity Interface](#21--solidity-interface)
* [22 — Deployment Architecture](#22--deployment-architecture)
* [23 — Genesis Walkthrough](#23--genesis-walkthrough)
* [24 — Full Genesis Lifecycle](#24--full-genesis-lifecycle)
* [25 — Why Genesis Exists](#25--why-genesis-exists)
* [26 — Reference Implementation Notes](#26--reference-implementation-notes)
* [27 — Final Disclaimer](#27--final-disclaimer)

---

# 01 — Pons V2 at a Glance

**Pons V2 Genesis is the first token ever launched by Pons using the V2 launch architecture.**

It serves as the first public Genesis example of a launch built around a complete:

```text
BONDING CURVE
      ↓
GRADUATION
      ↓
UNISWAP v4
      ↓
POST-GRADUATION FEES
      ↓
FEE ACCOUNTING
      ↓
BUYBACK INFRASTRUCTURE
      ↓
LOCKED SUPPLY
      ↓
LINEAR VESTING
```

A launch begins on a dedicated bonding curve.

Users can purchase the newly created token while the curve is active. The token supply is fixed from the moment of deployment and the entire supply is initially minted directly to the bonding curve.

Once the graduation threshold is reached, the launch transitions toward a Uniswap v4 pool.

After graduation, the architecture introduces a second phase built around post-graduation trading, fee collection, buyback infrastructure and locked supply.

The Genesis example exposes this entire lifecycle through the **first Pons V2 launch**.

### Genesis Buyback Wallet

The Genesis deployment exposes the following Buyback Wallet:

```text
0x30038cba4f728e90c6b7e92924fe2a7b267e4e19
```

This address is part of the buyback infrastructure associated with the Genesis launch.

The Buyback Wallet should be understood within the broader protocol architecture:

```text
Trading Activity
      │
      ▼
Fee Generation
      │
      ▼
Buyback Allocation
      │
      ▼
Buyback Wallet
      │
      ▼
BuybackVault
      │
      ▼
Locked Token Supply
      │
      ▼
Linear Vesting
```

---

# 02 — Genesis Architecture

```text
                         PONS V2 GENESIS
                                │
                                ▼
                         ┌─────────────┐
                         │LaunchFactory│
                         └──────┬──────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
             ┌────────────┐          ┌─────────────┐
             │LaunchToken │          │BondingCurve │
             └────────────┘          └──────┬──────┘
                                            │
                                            │ Threshold reached
                                            ▼
                                      ┌────────────┐
                                      │ Graduation │
                                      └──────┬─────┘
                                             │
                                  ┌──────────┴──────────┐
                                  ▼                     ▼
                           ┌─────────────┐       ┌──────────────┐
                           │ Uniswap v4  │       │LaunchLocker  │
                           │    Pool     │       │  Liquidity   │
                           └──────┬──────┘       └──────────────┘
                                  │
                                  ▼
                           ┌─────────────┐
                           │   MemeHook  │
                           └──────┬──────┘
                                  │
                                  ▼
                           ┌─────────────┐
                           │  FeeEscrow  │
                           └──────┬──────┘
                                  │
                                  ▼
                           ┌─────────────┐
                           │Buyback Flow │
                           └──────┬──────┘
                                  │
                                  ▼
                           ┌─────────────┐
                           │BuybackVault │
                           └──────┬──────┘
                                  │
                                  ▼
                         Locked Supply
                         + Linear Vesting
```

The Genesis launch therefore represents an entire protocol flow rather than a standalone ERC-20 deployment.

It is the first token to demonstrate this architecture through an actual Pons V2 launch.

---

# 11 — Buyback Architecture

One of the central components demonstrated by the Genesis example is the **BuybackVault** and its associated **Buyback Wallet infrastructure**.

The BuybackVault is designed to hold tokens acquired through the protocol's buyback mechanism.

Instead of treating bought-back tokens as immediately circulating supply, the vault locks them and applies a vesting schedule.

```text
Trading Activity
       │
       ▼
Fee Generation
       │
       ▼
Buyback Allocation
       │
       ▼
Buyback Wallet
       │
       ▼
Buyback Execution
       │
       ▼
Tokens Acquired
       │
       ▼
BuybackVault
       │
       ▼
Locked Token Supply
       │
       ▼
5-Year Linear Vesting
```

The vault tracks the total amount locked for each token.

The core storage concept is:

```solidity
totalLocked(token)
```

The vault can also calculate the currently releasable amount:

```solidity
releasable(token)
```

The Genesis example therefore exposes the buyback flow as an observable part of the wider Pons V2 architecture.

---

# 12 — The Buyback Wallet

The Genesis deployment explicitly exposes the address associated with its buyback infrastructure.

### Genesis Buyback Wallet

```text
0x30038cba4f728e90c6b7e92924fe2a7b267e4e19
```

The architecture is:

```text
                    PONS V2 GENESIS
                           │
                           ▼
                   Buyback Mechanism
                           │
                           ▼
                    Buyback Wallet
                           │
                           │
                           ▼
                     BuybackVault
                           │
                           ▼
                   Locked Token Supply
                           │
                           ▼
                   Linear Vesting
```

The Buyback Wallet should be understood as part of the protocol's buyback flow rather than as a discretionary creator wallet.

Its purpose within the Genesis architecture is to make the destination associated with buyback-related token flow publicly observable and auditable.

The Genesis example therefore allows users to inspect:

* The Genesis Buyback Wallet
* The associated buyback infrastructure
* The BuybackVault contract
* Tokens locked in the vault
* Total locked supply
* Vesting state
* Releasable supply

> [!NOTE]
>
> ### Genesis Buyback Wallet
>
> The Buyback Wallet associated with the Pons V2 Genesis launch is:
>
> ```text
> 0x30038cba4f728e90c6b7e92924fe2a7b267e4e19
> ```
>
> This address is included here as a deployment-specific reference for the Genesis example.

---

# 25 — Why Genesis Exists

Pons V2 Genesis is the **first token ever launched by Pons using the Pons V2 architecture**.

It is intended to be the first public example that makes the V2 architecture tangible.

Instead of describing the protocol only through abstract documentation, the Genesis launch provides a concrete token through which users can inspect the architecture directly.

The goal is to allow anyone to follow the lifecycle:

```text
Token Creation
      ↓
Bonding Curve
      ↓
Graduation
      ↓
Uniswap v4
      ↓
Hook Fees
      ↓
Fee Escrow
      ↓
Buyback Infrastructure
      ↓
Buyback Wallet
      ↓
BuybackVault
      ↓
Vesting
```

The Genesis token is therefore best understood as a:

> **Living technical demonstration of the Pons V2 architecture.**

It is the first token to pass through the Pons V2 launch architecture.

It is not intended to introduce a new utility token.

It is intended to demonstrate the protocol.

---

# 27 — Final Disclaimer

> [!WARNING]
>
> ## Pons V2 Genesis Is a Test Token
>
> **Pons V2 Genesis is the first token ever launched by Pons using the Pons V2 architecture.**
>
> It is a test token created exclusively for demonstration, experimentation and documentation purposes.
>
> It has no intrinsic utility.
>
> It is not designed or presented as an investment.
>
> It does not represent a promise of future protocol functionality.
>
> Its purpose is to provide the public with a concrete example of the Pons V2 architecture and demonstrate how the protocol's contracts can work together across:
>
> * Token creation
> * Bonding curves
> * Graduation
> * Uniswap v4
> * Fee collection
> * Buyback infrastructure
> * Buyback Wallet
> * Vesting
> * Liquidity locking
>
> The Genesis example exists to make the technology visible.

---

<p align="center">
  <strong>The first Pons V2 launch.</strong>
  <br><br>
  <strong>The token is the example.</strong>
  <br>
  <strong>The architecture is the point.</strong>
</p>
