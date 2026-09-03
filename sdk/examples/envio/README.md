# Pons v2 Envio example

This is the canonical source topology and normalized public-event reference for
indexing Pons v2 on Robinhood Chain mainnet. It deliberately keeps
application-specific pricing, holder, portfolio, and aggregate projections out
of the SDK.

The example demonstrates the protocol invariants an indexer must preserve:

- begin every fixed Pons source at the reviewed factory creation block;
- index the factory, meme hook, fee escrow, and buyback vault at the addresses
  pinned by the SDK deployment metadata;
- register each bonding curve and launch token from `TokenLaunched` rather than
  treating either as a fixed source;
- derive canonical launch-token supply from the token's full-supply ERC-20
  `Transfer` mint event, never from launch configuration or an end-of-block
  `totalSupply()` read;
- enable reorg rollback and retain a nonzero block lag;
- capture every reviewed Pons event and retain the Uniswap V4 PoolManager
  `Swap` dependency only after its pool ID was registered by the Pons hook.

## Use it

Install Envio and the SDK in an Envio project, then copy `config.yaml`,
`schema.graphql`, and the complete `src/` directory from this example into that
project. The artifact paths in `config.yaml` assume the SDK is installed at
`node_modules/@reptilianhq/pons-sdk`.

Set `ENVIO_ROBINHOOD_MAINNET_RPC_URL` for fallback and realtime reads. Configure
`ENVIO_HYPERSYNC_API_TOKEN` according to the Envio runtime when the selected
HyperSync endpoint requires authentication.

Run Envio code generation before starting the indexer. The generated `envio`
module supplies the typed `indexer` and entity context used by the handler.
For example: `npx envio codegen`.

The reference stores every reviewed event with bigint-safe JSON parameters and
also maintains a typed `PonsLaunch` identity/supply projection. Production
consumers can add domain entities for trades, fees, claims, vesting, and pool
lifecycle while keeping the source addresses, start block, event set, and
dynamic-registration boundary shown here intact.

Consumers that already own a larger Envio configuration may locate this
packaged example relative to a resolved SDK artifact, or consume
`getPonsIndexingManifest()` from `@reptilianhq/pons-sdk/indexing`. Envio runtime
tuning, application entities, pricing, aggregates, and RPC policy remain
consumer-owned.
