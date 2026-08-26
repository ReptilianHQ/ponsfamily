# Pons v2 Envio example

This is the canonical minimum source topology for indexing Pons v2 on Robinhood
Chain mainnet. It deliberately keeps application-specific trade, fee, holder,
and pool projections out of the SDK.

The example demonstrates the protocol invariants an indexer must preserve:

- begin every fixed Pons source at the reviewed factory creation block;
- index the factory, meme hook, fee escrow, and buyback vault at the addresses
  pinned by the SDK deployment metadata;
- register each bonding curve and launch token from `TokenLaunched` rather than
  treating either as a fixed source;
- derive canonical launch-token supply from the token's full-supply ERC-20
  `Transfer` mint event, never from launch configuration or an end-of-block
  `totalSupply()` read;
- enable reorg rollback and retain a nonzero block lag.

## Use it

Install Envio and the SDK in an Envio project, then copy `config.yaml`,
`schema.graphql`, `abis/LaunchToken.json`, and `src/EventHandlers.ts` from this
directory into that project. The artifact paths in `config.yaml` assume the SDK
is installed at `node_modules/@reptilianhq/pons-sdk`.

Set `ENVIO_ROBINHOOD_MAINNET_RPC_URL` for fallback and realtime reads. Configure
`ENVIO_HYPERSYNC_API_TOKEN` according to the Envio runtime when the selected
HyperSync endpoint requires authentication.

Run Envio code generation before starting the indexer. The generated `envio`
module supplies the typed `indexer` and entity context used by the handler.
For example: `npx envio codegen`.

The schema and handler are intentionally small. Production consumers should
add deterministic projections for the reviewed events they need, while keeping
the source addresses, start block, event set, and dynamic-registration boundary
shown here intact.

Consumers that already own a larger Envio configuration may locate this
packaged example relative to a resolved SDK artifact and compose its `PonsV2*`
global contract definitions plus its fixed chain sources into their local
config. Shared token ABIs, handlers, entities, RPC policy, and non-Pons
contracts remain consumer-owned.
