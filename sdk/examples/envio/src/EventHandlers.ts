import { indexer } from 'envio';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

indexer.contractRegister(
  { contract: 'PonsV2Factory', event: 'TokenLaunched' },
  ({ event, context }) => {
    context.chain.PonsV2Curve.add(event.params.curve);
    context.chain.PonsLaunchToken.add(event.params.token);
  },
);

indexer.onEvent(
  { contract: 'PonsV2Factory', event: 'TokenLaunched' },
  async ({ event, context }) => {
    const id = event.params.token.toLowerCase();
    const existing = await context.PonsLaunch.get(id);
    context.PonsLaunch.set({
      id,
      token: id,
      curve: event.params.curve.toLowerCase(),
      deployer: event.params.deployer.toLowerCase(),
      pairToken: event.params.pairToken.toLowerCase(),
      launchConfigId: event.params.launchConfigId,
      graduationThreshold: event.params.graduationThreshold,
      canonicalSupply: existing?.canonicalSupply,
      createdBlock: BigInt(event.block.number),
      supplyMintBlock: existing?.supplyMintBlock,
    });
  },
);

indexer.onEvent(
  { contract: 'PonsLaunchToken', event: 'Transfer' },
  async ({ event, context }) => {
    if (event.params.from.toLowerCase() !== ZERO_ADDRESS) return;

    const id = event.srcAddress.toLowerCase();
    const existing = await context.PonsLaunch.get(id);
    if (existing?.canonicalSupply !== undefined && existing.canonicalSupply !== event.params.value) {
      throw new Error(`Pons launch token ${id} emitted conflicting full-supply mints`);
    }

    context.PonsLaunch.set({
      id,
      token: id,
      curve: existing?.curve,
      deployer: existing?.deployer,
      pairToken: existing?.pairToken,
      launchConfigId: existing?.launchConfigId,
      graduationThreshold: existing?.graduationThreshold,
      canonicalSupply: event.params.value,
      createdBlock: existing?.createdBlock,
      supplyMintBlock: BigInt(event.block.number),
    });
  },
);
