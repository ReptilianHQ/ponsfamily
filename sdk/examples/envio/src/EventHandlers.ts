import { indexer } from 'envio';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

type ProtocolEvent = {
  chainId: number;
  srcAddress: string;
  logIndex: number;
  params: unknown;
  block: { number: number };
  transaction: { hash?: string };
};

type ProtocolEventContext = {
  PonsProtocolEvent: {
    set(value: {
      id: string;
      kind: string;
      contract: string;
      sourceAddress: string;
      transactionHash?: string;
      blockNumber: bigint;
      logIndex: bigint;
      payload: string;
    }): void;
  };
};

function json(value: unknown): string {
  return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item);
}

function recordProtocolEvent(
  context: ProtocolEventContext,
  event: ProtocolEvent,
  contract: string,
  kind: string,
): void {
  context.PonsProtocolEvent.set({
    id: `${event.chainId}:${event.block.number}:${event.logIndex}`,
    kind,
    contract,
    sourceAddress: event.srcAddress.toLowerCase(),
    transactionHash: event.transaction.hash?.toLowerCase(),
    blockNumber: BigInt(event.block.number),
    logIndex: BigInt(event.logIndex),
    payload: json(event.params),
  });
}

indexer.contractRegister(
  { contract: 'PonsV2Factory', event: 'TokenLaunched' },
  async ({ event, context }) => {
    context.chain.PonsV2Curve.add(event.params.curve);
    context.chain.PonsLaunchToken.add(event.params.token);
  },
);

indexer.onEvent(
  { contract: 'PonsV2Factory', event: 'TokenLaunched' },
  async ({ event, context }) => {
    recordProtocolEvent(context, event, 'PonsV2Factory', 'TokenLaunched');
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
    recordProtocolEvent(context, event, 'PonsLaunchToken', 'Transfer');
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

function capture(contract: string, kind: string) {
  return async ({ event, context }: { event: ProtocolEvent; context: ProtocolEventContext }) => {
    recordProtocolEvent(context, event, contract, kind);
  };
}

indexer.onEvent({ contract: 'PonsV2Factory', event: 'LaunchSwept' }, capture('PonsV2Factory', 'LaunchSwept'));
indexer.onEvent({ contract: 'PonsV2Factory', event: 'CreatorFeeRecipientUpdated' }, capture('PonsV2Factory', 'CreatorFeeRecipientUpdated'));
indexer.onEvent({ contract: 'PonsV2Factory', event: 'BuybackEnabledUpdated' }, capture('PonsV2Factory', 'BuybackEnabledUpdated'));
indexer.onEvent({ contract: 'PonsV2Factory', event: 'PoolGraduated' }, capture('PonsV2Factory', 'PoolGraduated'));
indexer.onEvent({ contract: 'PonsV2Factory', event: 'LaunchGraduationRescued' }, capture('PonsV2Factory', 'LaunchGraduationRescued'));
indexer.onEvent({ contract: 'PonsV2Curve', event: 'CurveBuy' }, capture('PonsV2Curve', 'CurveBuy'));
indexer.onEvent({ contract: 'PonsV2Curve', event: 'CurveBuyRefunded' }, capture('PonsV2Curve', 'CurveBuyRefunded'));
indexer.onEvent({ contract: 'PonsV2Curve', event: 'CurveSell' }, capture('PonsV2Curve', 'CurveSell'));
indexer.onEvent({ contract: 'PonsV2Curve', event: 'FeesSwept' }, capture('PonsV2Curve', 'FeesSwept'));
indexer.onEvent({ contract: 'PonsV2Curve', event: 'BuybackLocked' }, capture('PonsV2Curve', 'BuybackLocked'));
indexer.onEvent({ contract: 'PonsV2Curve', event: 'CurveCompleted' }, capture('PonsV2Curve', 'CurveCompleted'));
indexer.onEvent({ contract: 'PonsV2MemeHook', event: 'PoolRegistered' }, capture('PonsV2MemeHook', 'PoolRegistered'));
indexer.onEvent({ contract: 'PonsV2MemeHook', event: 'ProtocolFeeRecipientUpdated' }, capture('PonsV2MemeHook', 'ProtocolFeeRecipientUpdated'));
indexer.onEvent({ contract: 'PonsV2MemeHook', event: 'HookFeeCollected' }, capture('PonsV2MemeHook', 'HookFeeCollected'));
indexer.onEvent({ contract: 'PonsV2MemeHook', event: 'PoolFeesSwept' }, capture('PonsV2MemeHook', 'PoolFeesSwept'));
indexer.onEvent({ contract: 'PonsV2MemeHook', event: 'PoolFeesRescued' }, capture('PonsV2MemeHook', 'PoolFeesRescued'));
indexer.onEvent({ contract: 'PonsV2FeeEscrow', event: 'Credited' }, capture('PonsV2FeeEscrow', 'Credited'));
indexer.onEvent({ contract: 'PonsV2FeeEscrow', event: 'CreditedToken' }, capture('PonsV2FeeEscrow', 'CreditedToken'));
indexer.onEvent({ contract: 'PonsV2FeeEscrow', event: 'Claimed' }, capture('PonsV2FeeEscrow', 'Claimed'));
indexer.onEvent({ contract: 'PonsV2FeeEscrow', event: 'ClaimedToken' }, capture('PonsV2FeeEscrow', 'ClaimedToken'));
indexer.onEvent({ contract: 'PonsV2BuybackVault', event: 'Locked' }, capture('PonsV2BuybackVault', 'Locked'));
indexer.onEvent({ contract: 'PonsV2BuybackVault', event: 'Released' }, capture('PonsV2BuybackVault', 'Released'));
indexer.onEvent({ contract: 'PonsV2BuybackVault', event: 'CreatorRecipientUpdated' }, capture('PonsV2BuybackVault', 'CreatorRecipientUpdated'));
indexer.onEvent({ contract: 'UniswapV4PoolManager', event: 'Initialize' }, capture('UniswapV4PoolManager', 'Initialize'));
indexer.onEvent({ contract: 'UniswapV4PoolManager', event: 'Swap' }, capture('UniswapV4PoolManager', 'Swap'));
