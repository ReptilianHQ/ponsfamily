# Pons v2 Envio starter

This repo-local starter is generated from `sdk/src/indexing.ts`. It captures all
reviewed SDK protocol events (including the forwarder), discovers curves and
tokens from the factory. PoolManager swaps are disabled by default; explicit
verified pool selections enable indexed topic filtering before ingestion. The SDK package publishes the vendor-neutral
manifest and event ABIs; it does not publish this starter.

## Run locally

From `sdk/examples/envio`:

```sh
npm ci
npm run check
# Set ENVIO_ROBINHOOD_MAINNET_RPC_URL in your environment.
# Set ENVIO_HYPERSYNC_API_TOKEN if your HyperSync endpoint requires it.
npm run dev
```

Use a local PostgreSQL/Docker environment supported by Envio. These commands
index public chain data into your local database; they do not sign transactions.
Envio and TypeScript are exact-pinned in this starter's own npm lockfile. The
local `abis/` files are generated from the same catalog as the published SDK
artifacts, so a checkout can run before its SDK version has been published.
Copy the complete starter directory if you need a separate local project.

## Maintain the reference

From `sdk/`:

```sh
npm ci
npm run generate:indexing
npm run check:indexing
npm run check:envio-example
npm run test:unit
npm run test:pack
```

Edit event descriptions, parameter semantics, discovery topology and the
materialization declarations in `src/indexing.ts`. ABI shapes come from the
reviewed SDK ABIs. The generic code emitter lives in `scripts/generate-indexing.mjs`;
its event-envelope template is `scripts/indexing-event-log.ts.template`.
Never edit generated config, schema, handlers, helper code, or ABIs. `--check`
compares every generated file without writing and rejects obsolete outputs.
`artifacts/`, `indexing/`, `examples/envio/abis/`, and `examples/envio/src/` are
exclusively generator-owned. Keep custom consumer code outside those directories.

## Evidence and replay

`PonsProtocolEvent` is the append-only normalized log. It contains chain,
contract and event identity, block hash/number/time, transaction hash/index,
log index and decoded JSON. Bigints are decimal strings, including signed
PoolManager deltas. IDs include chain ID, block hash and log index, making
repeated delivery of the same canonical log idempotent.

`PonsLaunch` joins factory identity with the token's full-supply ERC-20 mint.
Supply comes only from `Transfer` with a zero sender. A mint can precede
`TokenLaunched` in the same transaction: [Envio's contract registration phase](https://docs.envio.dev/docs/HyperIndex/dynamic-contracts)
must discover the token and replay its discovery block before ordinary handlers
finish. Identity and supply updates preserve partial state in either order;
conflicting full-supply evidence fails. Ordinary transfers never change supply.

`PonsPool` proves membership from `PoolRegistered` at the reviewed hook. Both
materialized entity keys include chain ID. Handlers process canonical log order;
a PoolManager swap without earlier membership evidence is excluded. There is no
RPC lookup or speculative membership inference during handling.

`rollback_on_reorg: true` rolls back orphaned event rows and materialized state
together. Append-only means canonical history, not retention of orphaned forks.
Changing schema, IDs or materialization rules requires a fresh database/replay;
this version adds provenance and chain-scoped entity IDs and is not an in-place
migration of the old starter. Fixture tests cover the generated handler logic;
Envio codegen/type-checking verifies the pinned runtime API. A live replay and
actual reorg exercise remain a consumer's deployment smoke boundary.

Third-party indexers can import `getPonsIndexingManifest()` from
`@reptilianhq/pons-sdk/indexing` or the decimal-string JSON manifest from
`@reptilianhq/pons-sdk/indexing/mainnet.json`. Consumers own their subscription
policy, schema, pricing, persistence, runtime tuning, and provider credentials.

## Select PoolManager pools

From `sdk/`, generate with `node scripts/generate-indexing.mjs --pool-selection
selected-pools.json`. Supply an array of verified Pons v4 references from
`readPonsV4PoolRegistrations`, serializing bigint values as decimal strings.
The generator validates identity and limits the selection to 256 entries, then
adds the manager address and an indexed `id` filter to the Swap registration.
No selection means no manager subscription, not a wildcard. Use the same flag
with `--check` to verify a consumer's generated selection.

Selection files are trusted canonical discovery inputs; structural validation
does not prove RPC provenance. New selections require regeneration and replay
from deployment history, including the full discovery block. This starter does
not update topic subscriptions dynamically. Revalidate canonical registration
when restoring persisted selections or after a reorg; remove orphaned membership
and replay projections. Its ordered handler excludes pre-registration swaps.
Never substitute manager-wide ingestion when filtering is unavailable.
