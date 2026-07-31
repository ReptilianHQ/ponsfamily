<div align="center">

<img src="media/logo.png" alt="Pons Family" width="96" height="96" />

# Pons Launchpad Contracts

<a href="https://ponsfamily.com">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=500&size=20&duration=2800&pause=900&color=1a2740&center=true&vCenter=true&width=620&lines=CREATE2+token+factory+for+ponsfamily.com;One-sided+Uniswap+V3+liquidity%2C+locked+on+launch;Fixed-supply+ERC-20+with+anti-snipe+limits;Deployed+on+Robinhood+Chain" alt="Typing SVG" />
</a>

[![License: MIT](https://img.shields.io/badge/license-MIT-1a2740?style=for-the-badge)](LICENSE)
[![Solidity](https://img.shields.io/badge/solidity-%5E0.8.30-1a2740?style=for-the-badge&logo=solidity&logoColor=white)](contracts/src)
[![Chain](https://img.shields.io/badge/chain-Robinhood%20Chain-1a2740?style=for-the-badge)](#stack)
[![Website](https://img.shields.io/badge/website-ponsfamily.com-1a2740?style=for-the-badge&logo=googlechrome&logoColor=white)](https://ponsfamily.com)
[![X](https://img.shields.io/badge/follow-%40ponsdotfamily-1a2740?style=for-the-badge&logo=x&logoColor=white)](https://x.com/ponsdotfamily)

[![OpenZeppelin](https://img.shields.io/badge/security-OpenZeppelin-1a2740?style=flat-square)](#vendor-dependencies)
[![Uniswap V3](https://img.shields.io/badge/liquidity-Uniswap%20V3-1a2740?style=flat-square)](#contractssrcponslaunchfactorysol)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-1a2740?style=flat-square)](#contributing)

</div>

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:1a2740,100:05070d&height=3&section=header" width="100%" />

This repository holds the Solidity source for the ponsfamily.com token launchpad, deployed on Robinhood Chain. It is a CREATE2 factory that mints a fixed-supply ERC-20 token, opens a one-sided Uniswap V3 liquidity position, locks the position NFT, and can optionally run a developer buy in the same launch transaction.

Website: [ponsfamily.com](https://ponsfamily.com) · Twitter/X: [@ponsdotfamily](https://x.com/ponsdotfamily)

> **v2 is coming.** Alongside the v1 contracts documented in this README, this repo also carries an early, not-yet-public v2 launchpad under `contracts/v2/`: instead of a one-sided Uniswap V3 position, tokens will launch on a bonding curve that graduates into a locked Uniswap V4 pool once a threshold is reached. It isn't live for the public yet.

## Table of contents

- [Why this launchpad](#why-this-launchpad)
- [Deployed factory](#deployed-factory)
- [Stack](#stack)
- [Repository layout](#repository-layout)
- [Core contracts](#core-contracts)
- [Vendor dependencies](#vendor-dependencies)
- [Generated files](#generated-files)
- [Design notes](#design-notes)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

## Why this launchpad

Launching a token normally takes several separate transactions: deploying the contract, initializing the pool, opening liquidity, locking the position, and sometimes a first buy. Each step is a place where something can fail or get front-run. This launchpad handles all of it in a single call.

Key features:

- CREATE2 factory, so the token address is predictable before it is even deployed
- One-sided Uniswap V3 liquidity, with the full supply concentrated from the first block
- Position NFT locked through a configurable locker rather than left sitting in a plain wallet
- Anti-snipe limits during the launch window: same-block buy blocking, a per-wallet cap, and a cumulative buy cap
- Optional developer buy, settled atomically in the same transaction as the launch
- Graduation status calculated from the capital actually locked in the pool, not from wallet balances that can be faked

## Deployed factory

```
0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB
```

This is the address of the `PonsLaunchFactory` used by the pons.family frontend. `abi.json` and `contract-meta.json` in this repository describe this exact deployment.

## Stack

| Item           | Value                                         |
| -------------- | ---------------------------------------------- |
| Language       | Solidity `^0.8.30`                              |
| Chain          | Robinhood Chain (EVM L2)                        |
| Product        | [ponsfamily.com](https://ponsfamily.com)        |
| Factory        | `0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB`    |
| Access control | OpenZeppelin `Ownable2Step`                     |
| Safety         | OpenZeppelin `ReentrancyGuard`, `SafeERC20`     |

## Repository layout

```
.
├── README.md
├── abi.json
├── contract-meta.json
├── media/
└── contracts/
    ├── src/
    │   ├── PonsLaunchFactory.sol
    │   ├── PonsLauncherToken.sol
    │   ├── interfaces/
    │   │   └── ILaunchpad.sol
    │   └── libraries/
    │       ├── PonsLiquidityMath.sol
    │       └── PonsTickMath.sol
    ├── lib/
    │   └── openzeppelin-contracts/
    │       └── contracts/
    │           ├── access/
    │           │   ├── Ownable.sol
    │           │   └── Ownable2Step.sol
    │           ├── interfaces/
    │           │   ├── IERC1363.sol
    │           │   ├── IERC165.sol
    │           │   ├── IERC20.sol
    │           │   ├── IERC20Metadata.sol
    │           │   └── draft-IERC6093.sol
    │           ├── token/ERC20/
    │           │   ├── ERC20.sol
    │           │   ├── IERC20.sol
    │           │   ├── extensions/IERC20Metadata.sol
    │           │   └── utils/SafeERC20.sol
    │           └── utils/
    │               ├── Context.sol
    │               ├── Panic.sol
    │               ├── ReentrancyGuard.sol
    │               ├── StorageSlot.sol
    │               ├── introspection/IERC165.sol
    │               └── math/
    │                   ├── Math.sol
    │                   └── SafeCast.sol
    └── v2/                      # not yet live for the public — see the v2 note above
        ├── contracts/
        ├── scripts/
        ├── test/
        ├── README.md
        ├── package.json
        └── package-lock.json
```

## Core contracts

### `contracts/src/PonsLaunchFactory.sol`

The launchpad's main entry point, used by pons.family.

- Owner-managed DEX profiles (Uniswap V3 factory, position manager, swap router, fee tier, tick spacing)
- Owner-managed launch presets (pair asset, supply, anti-snipe windows, graduation threshold, initial tick)
- `launchToken(...)`: deploys the token via CREATE2, initializes the pool, mints one-sided liquidity, locks the position NFT through the configured locker, and optionally swaps leftover native value into the new token
- `predictTokenAddress(...)`: gives a deterministic address preview for frontends and integrators
- `graduationStatus(...)`: reads locked position principal against the stored threshold

Live address: `0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB`

### `contracts/src/PonsLauncherToken.sol`

The fixed-supply ERC-20 spawned by the factory for each launch.

- The entire supply is minted to the factory, then deposited as V3 liquidity
- On-chain metadata: logo, description, socials
- Early-window buy limits against the canonical pool (same-block buy block, max wallet, cumulative max buy)
- A narrow, factory-controlled exemption lets the atomic launch buy settle cleanly

### `contracts/src/interfaces/ILaunchpad.sol`

The interfaces the factory and token rely on:

- Uniswap V3 factory, pool, and position manager shapes
- SwapRouter02 and classic V3 router param structs
- The `IPonsLaunchFactory.LaunchedToken` record
- `IPonsLaunchLocker` hooks, used once the position NFT leaves the factory

### `contracts/src/libraries/PonsLiquidityMath.sol`

Pure math that converts concentrated liquidity into token0/token1 principal. Used by graduation checks so liquidity donated to the pool cannot fake progress.

### `contracts/src/libraries/PonsTickMath.sol`

Tick to `sqrtPriceX96` conversion, used to initialize the launch pool in line with Uniswap V3's expectations.

## Vendor dependencies

`contracts/lib/openzeppelin-contracts` contains the OpenZeppelin contracts vendored for this build, compiled with the same settings as the live factory.

| File                                        | Role in this project                                   |
| ------------------------------------------- | ------------------------------------------------------ |
| `access/Ownable.sol`                        | Base ownership primitives                               |
| `access/Ownable2Step.sol`                   | Two-step owner transfer on the factory                  |
| `token/ERC20/ERC20.sol`                     | ERC-20 implementation inherited by `PonsLauncherToken`  |
| `token/ERC20/IERC20.sol`                    | ERC-20 interface                                        |
| `token/ERC20/extensions/IERC20Metadata.sol` | Name, symbol, and decimals interface                    |
| `token/ERC20/utils/SafeERC20.sol`           | Safe approvals and transfers in the factory              |
| `utils/Context.sol`                         | `msg.sender` abstraction used by Ownable and ERC20      |
| `utils/ReentrancyGuard.sol`                 | Guards `launchToken` against reentrancy                  |
| `utils/Panic.sol`                           | Panic helpers used by Math                               |
| `utils/StorageSlot.sol`                     | Low-level storage helpers                                |
| `utils/math/Math.sol`                       | `mulDiv` for liquidity valuation                         |
| `utils/math/SafeCast.sol`                   | Safe integer casting helpers                             |
| `utils/introspection/IERC165.sol`           | ERC-165 interface                                        |
| `interfaces/IERC20.sol`                     | Interface re-export path                                 |
| `interfaces/IERC20Metadata.sol`             | Interface re-export path                                 |
| `interfaces/IERC165.sol`                    | Interface re-export path                                 |
| `interfaces/IERC1363.sol`                   | ERC-1363 interface referenced by SafeERC20               |
| `interfaces/draft-IERC6093.sol`             | Custom ERC-20 error definitions                          |

## Generated files

### `abi.json`

The ABI for `PonsLaunchFactory` at `0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB`, ready for ethers, viem, or cast bindings, and used by the pons.family frontend and tooling.

### `contract-meta.json`

Build and deployment notes for the live factory: compiler version, optimizer settings, EVM target, and file list.

## Design notes

1. **Single-transaction launch.** Token deployment, pool creation, liquidity lock, and any developer buy share one call to `launchToken`, so the frontend wallet only signs once.
2. **Deterministic addresses.** CREATE2 makes the token address predictable before deployment through `predictTokenAddress`.
3. **One-sided V3 liquidity.** The full supply sits on one side of the range; paired-asset depth grows as buyers come in.
4. **Temporary buy pressure limits.** The restriction window lives on the token itself; standard ERC-20 behavior resumes once it ends.
5. **Graduation without fake depth.** Status is derived from locked position principal, not arbitrary wallet balances.

## Security

- Ownership transfers go through OpenZeppelin's `Ownable2Step`, a two-step process that avoids accidentally losing control on a bad transfer.
- `launchToken` is protected by `ReentrancyGuard`.
- Token transfers use `SafeERC20` throughout.
- `PonsTickMath.sol` keeps its `GPL-2.0-or-later` license, inherited from Uniswap V3. If you fork this repository, keep that file's header intact.
- This repository ships source only. Always verify the deployed bytecode against `contract-meta.json` before trusting the live factory address.

If you find a security issue, please report it privately instead of opening a public issue. Contact details are on [ponsfamily.com](https://ponsfamily.com).

## Contributing

Issues and pull requests are welcome.

## License

- First-party Pons contracts: MIT (see SPDX headers)
- `PonsTickMath.sol`: GPL-2.0-or-later (Uniswap V3 tick math lineage)
- OpenZeppelin sources: MIT (upstream)

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=waving&color=0:1a2740,100:05070d&height=100&section=footer" width="100%" />

If this project is useful to you, consider starring the repository.
</div>
