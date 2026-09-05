# Reptilian Pons Integration SDK

Reptilian-maintained, runtime-neutral TypeScript integration kit for Pons v2 on Robinhood Chain. This is an independent integration package, not an official Pons release. Applications choose wallets, RPC transports, gas, persistence, and authorization; this package owns reviewed protocol facts and deterministic protocol operations.

The initial release targets the live Pons v2 factory and atomic launch-and-buy forwarder. It does not wrap Pons v1.

## Install

The package is distributed through ReptilianHQ's GitHub Packages registry.
Configure the `@reptilianhq` scope and provide a token with package read access
before installing:

```ini
@reptilianhq:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Install the release-candidate channel with:

```bash
pnpm add @reptilianhq/pons-sdk@rc viem
```

Install the stable channel with:

```bash
pnpm add @reptilianhq/pons-sdk@latest viem
```

Node.js 22 or newer is supported. `viem` 2.x is a peer dependency.

## Launch a token

```ts
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import {
  applySlippage,
  buildLaunchTransaction,
  quoteCurveBuy,
  readLaunchTerms,
  robinhoodMainnet,
} from "@reptilianhq/pons-sdk";

const publicClient = createPublicClient({ transport: http(process.env.ROBINHOOD_RPC_URL) });
const walletClient = createWalletClient({ transport: http(process.env.ROBINHOOD_RPC_URL) });
const [account] = await walletClient.getAddresses();

const terms = await readLaunchTerms(publicClient, robinhoodMainnet, account);
const launchConfig = terms.configs.find((config) => config.id === 0);
if (!launchConfig?.enabled) throw new Error("Pons launch config 0 is unavailable");
const expectedEconomics = await publicClient.readContract({
  address: robinhoodMainnet.contracts.factory,
  abi: (await import("@reptilianhq/pons-sdk/abis")).ponsFactoryAbi,
  functionName: "previewLaunchEconomics",
  args: [0n, "0x0000000000000000000000000000000000000000"],
});
const openingQuoteIn = parseEther("0.01");
const reservedTokens = launchConfig.supply * launchConfig.phantomQuote
  / (launchConfig.phantomQuote + launchConfig.graduationThreshold);
const openingTokensOut = quoteCurveBuy({
  amountIn: openingQuoteIn,
  quoteReserve: launchConfig.phantomQuote,
  tokenReserve: launchConfig.supply,
  sellableTokens: launchConfig.supply - reservedTokens,
  feeBps: launchConfig.curveFeeBps,
  creatorTaxBps: 0n,
});

const request = buildLaunchTransaction(robinhoodMainnet, {
  token: {
    name: "My Token",
    symbol: "MYTOKEN",
    salt: crypto.getRandomValues(new Uint8Array(32)).reduce(
      (hex, byte) => `${hex}${byte.toString(16).padStart(2, "0")}`,
      "0x",
    ) as `0x${string}`,
    expectedEconomics,
  },
  launchConfigId: 0n,
  launchFee: terms.launchFee,
  openingBuy: {
    quoteIn: openingQuoteIn,
    minTokensOut: applySlippage(openingTokensOut, 100),
    recipient: account,
  },
});

const hash = await walletClient.sendTransaction({ account, ...request });
```

The example derives its minimum from the live launch config with a 1% tolerance. If `creatorTaxBps` is nonzero, use the same value in the quote. In production, re-read the config and economics immediately before use, simulate the exact request, and verify the mined transaction and receipt before persisting a launch.

`buildLaunchTransaction` requires a nonzero `expectedEconomics` digest so a
reviewed launch cannot silently execute under changed economics. Infrastructure
that intentionally accepts the live terms may omit the digest only by passing
`unsafeAllowUnpinnedEconomics: true` in the token parameters.

## Trade the bonding curve

```ts
import {
  applySlippage,
  buildApprovalTransaction,
  buildCurveBuyTransaction,
  quoteCurveBuy,
  readCurveSnapshot,
} from "@reptilianhq/pons-sdk";

const snapshot = await readCurveSnapshot(publicClient, curveAddress);
const quoteIn = parseEther("0.01");
const tokensOut = quoteCurveBuy({
  amountIn: quoteIn,
  quoteReserve: snapshot.quoteReserve,
  tokenReserve: snapshot.tokenReserve,
  sellableTokens: snapshot.sellableTokens,
  feeBps: snapshot.feeBps,
  creatorTaxBps: snapshot.creatorTaxBps,
});

const buy = buildCurveBuyTransaction({
  curve: curveAddress,
  pairToken: snapshot.pairToken,
  quoteIn,
  minTokensOut: applySlippage(tokensOut, 100),
  recipient: account,
});
```

ERC-20 quote buys and all sells require the normal ERC-20 allowance first; use `buildApprovalTransaction` with the curve as spender.

For the final curve buy, use `quoteCurveBuyExecution` to review the actual
quote spend and refund. Use `quoteCurveBuyExactTokensOut` when an application
needs the minimum live quote input for a target token quantity. Both helpers
mirror the contract's separate fee rounding and final-fill repricing.

## Manage fees after graduation

Use `readGraduatedPoolFeeState` to derive the canonical Uniswap v4 pool ID and
review pending hook fees, buyback allocation, and creator tax. The returned pool
ID can be passed to `buildSweepPoolFeesTransaction`; verify the mined evidence
with `verifyPoolFeesSweptReceipt` before persisting it.

Creator and protocol proceeds are credited to a shared escrow ledger. Read them
with `readFeeEscrowBalances`, build exact native or ERC-20 claims with
`buildClaimNativeFeesTransaction` or `buildClaimTokenFeesTransaction`, and
verify the corresponding claim event. These balances are recipient-wide, not
scoped to one launch.

Use `readBuybackVest` to show locked, vested, released, and currently releasable
amounts. `buildReleaseBuybackTransaction` releases the currently vested amount;
`verifyBuybackReleasedReceipt` proves the creator/protocol split recorded by the
vault.

## Verify before trusting a deployment

```ts
import { assertCompatibleDeployment, robinhoodMainnet } from "@reptilianhq/pons-sdk";

await assertCompatibleDeployment(publicClient, robinhoodMainnet);
```

This checks the chain ID, factory and value-carrying forwarder runtime bytecode hashes, factory dependency pointers, and the forwarder-to-factory pointer at one block. It proves deployment identity and wiring, not live operational state such as launch enablement.

The published provenance records the forwarder's creation transaction, block, verified explorer source, source hash, compiler, and runtime code hash. It also identifies the verified deployed hook, escrow, and buyback-vault sources used for the exported event artifacts. No public Git commit for the verified forwarder source was available at review time, so `forwarderSourceCommit` is explicitly `null` rather than implying that the factory source revision covers it.

## Package boundaries

- `@reptilianhq/pons-sdk/abis` — reviewed consumer ABIs
- `@reptilianhq/pons-sdk/artifacts/*` — Envio-compatible event ABI JSON
- `@reptilianhq/pons-sdk/examples/envio` — canonical Envio mainnet source and dynamic-registration example
- `@reptilianhq/pons-sdk/indexing` — versioned event, artifact, address, start-block, and dynamic-source manifest
- `@reptilianhq/pons-sdk/provenance/mainnet.json` — machine-readable reviewed deployment provenance
- `@reptilianhq/pons-sdk/deployments` — pinned chain and contract metadata
- `@reptilianhq/pons-sdk/math` — exact bigint curve quotes and slippage floors
- `@reptilianhq/pons-sdk/projection` — persistence-neutral reserve and launch-lifecycle event folds
- `@reptilianhq/pons-sdk/transactions` — deterministic calldata builders
- `@reptilianhq/pons-sdk/reads` — typed public-client reads
- `@reptilianhq/pons-sdk/receipts` — transaction and event verification
- `@reptilianhq/pons-sdk/compatibility` — deployment identity checks

The SDK never signs, broadcasts, chooses gas, stores keys, chooses an indexer
schema, or calls an application API. Its projection helpers return protocol
state only; consumers remain responsible for persistence, block metadata,
pricing, balances, aggregates, and telemetry.
Curve helpers fail with `ARITHMETIC_OVERFLOW` when an input or checked intermediate cannot be represented by Solidity's `uint256` arithmetic.
Published source maps intentionally embed the TypeScript source so consumers can inspect and debug the open integration logic.

The SDK does not derive canonical launch-token supply. Indexers must derive exact supply from the token's full-supply ERC-20 `Transfer` mint event; launch configuration and end-of-block `totalSupply()` reads are not substitutes for that event evidence.

See [`examples/envio`](./examples/envio/README.md) for a copyable Envio configuration that declares and captures every reviewed Pons event, filters PoolManager swaps to Pons-registered pools, registers each launched curve and token dynamically, and projects that mint evidence. Consumers that compose a larger configuration should use `getPonsIndexingManifest()` as the machine-readable protocol boundary rather than parsing the example YAML; its PoolManager dependency includes the required `PoolRegistered.poolId` membership filter.

## Provenance

The v2 consumer ABI is reviewed against Pons source commit `836f0f97f9a9569855876570d6778501c163c883`. The mainnet factory was created at block `26841846`; its pinned runtime code hash is exposed in `robinhoodMainnet`.

## License

The SDK source is publicly visible, but no additional license or permission to use, copy, modify, or distribute it is granted.

## Release

Keep `package.json` at the intended stable version. Creating a branch named
`release/vX.Y.Z` from the exact reviewed `main` commit publishes the next
immutable `X.Y.Z-rc.N` to GitHub Packages with the `rc` dist-tag. After the RC
is accepted, tagging that same commit `vX.Y.Z` publishes the stable `X.Y.Z`
package with the `latest` dist-tag. Branches and tags whose version does not
exactly match `package.json` fail closed.

RC and stable package versions are immutable. Do not commit an `-rc` version to
`package.json`, reuse an already published version, or create an RC Git tag. If
an RC is rejected, merge the fix to `main` and advance the same release branch
to publish the next numbered candidate. See
[`RELEASING.md`](./RELEASING.md) for the exact checklist and verification
commands.

The package is intentionally public and contains only the runtime-neutral SDK,
public deployment provenance, ABI artifacts, and the canonical Envio example.
GitHub's npm registry still requires an access token to install public packages.
The workflow publishes with `--access public` and verifies that GitHub continues
to report public visibility after every release.

Run `npm test` before release.
