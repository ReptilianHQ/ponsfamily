import { erc20Abi, parseAbiItem, getAddress } from 'viem';
import { ponsFactoryAbi } from './abis.js';
import { PonsSdkError } from './errors.js';
/** Enumerate candidates from factory events; current approval is always read separately. */
export async function readPairTokenCandidates(client, deployment, fromBlock, toBlock) {
    let requests = 0;
    const addresses = new Set();
    async function scan(from, to) {
        if (++requests > 2048)
            throw new Error('Pons approval history exceeds the scan budget.');
        let logs;
        try {
            logs = await client.getLogs({ address: deployment.contracts.factory,
                event: parseAbiItem('event PairTokenApprovalUpdated(address indexed pairToken, bool approved)'),
                fromBlock: from, toBlock: to, strict: true });
        }
        catch (error) {
            if (to - from < 1000n || !/range|limit|too many|response size|block.*exceed/i.test(String(error)))
                throw error;
            const middle = (from + to) / 2n;
            await scan(from, middle);
            await scan(middle + 1n, to);
            return;
        }
        for (const log of logs)
            addresses.add(getAddress(log.args.pairToken));
        if (addresses.size > 10_000)
            throw new Error('Pons approval catalog exceeds the asset budget.');
    }
    for (let from = fromBlock; from <= toBlock; from += 1000000n) {
        await scan(from, from + 999999n < toBlock ? from + 999999n : toBlock);
    }
    return [...addresses];
}
/** Returns null for a revoked asset. Reads approval, economics and metadata at one block. */
export async function readPairAsset(client, deployment, token, blockNumber) {
    const address = getAddress(token);
    const read = { address: deployment.contracts.factory, abi: ponsFactoryAbi, blockNumber };
    const approved = await client.readContract({ ...read, functionName: 'approvedPairTokens', args: [address] });
    if (!approved)
        return null;
    const [economics, decimals, symbol, name] = await Promise.all([
        client.readContract({ ...read, functionName: 'pairTokenEconomics', args: [address] }),
        client.readContract({ address, abi: erc20Abi, functionName: 'decimals', blockNumber }),
        client.readContract({ address, abi: erc20Abi, functionName: 'symbol', blockNumber }).catch(() => address),
        client.readContract({ address, abi: erc20Abi, functionName: 'name', blockNumber }).catch(() => address),
    ]);
    if (economics[0] <= 0n || economics[1] <= 0n || economics[2] !== decimals) {
        throw new PonsSdkError('INVALID_ARGUMENT', 'Pons pair economics or decimals are invalid.');
    }
    return { address, name: name.slice(0, 128), symbol: symbol.slice(0, 64), decimals,
        phantomQuote: economics[0], graduationThreshold: economics[1] };
}
//# sourceMappingURL=pairAssets.js.map