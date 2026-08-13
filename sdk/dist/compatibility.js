import { keccak256 } from "viem";
import { ABI_REVISION, ponsFactoryAbi, ponsForwarderAbi } from "./abis.js";
import { PonsSdkError } from "./errors.js";
export async function assertCompatibleDeployment(client, deployment, options = {}) {
    if (deployment.abiRevision !== ABI_REVISION)
        mismatch("ABI_REVISION_MISMATCH", "abiRevision", ABI_REVISION, deployment.abiRevision);
    const chainId = await client.getChainId();
    if (chainId !== deployment.chainId)
        mismatch("CHAIN_MISMATCH", "chainId", String(deployment.chainId), String(chainId));
    const blockNumber = options.blockNumber ?? await client.getBlockNumber();
    const [factoryBytecode, forwarderBytecode, memeHookBytecode, feeEscrowBytecode, buybackVaultBytecode] = await Promise.all([
        client.getBytecode({ address: deployment.contracts.factory, blockNumber }),
        client.getBytecode({ address: deployment.contracts.forwarder, blockNumber }),
        client.getBytecode({ address: deployment.contracts.memeHook, blockNumber }),
        client.getBytecode({ address: deployment.contracts.feeEscrow, blockNumber }),
        client.getBytecode({ address: deployment.contracts.buybackVault, blockNumber }),
    ]);
    if (!factoryBytecode || factoryBytecode === "0x")
        mismatch("CODE_MISSING", "contracts.factory", "deployed bytecode", "0x");
    if (!forwarderBytecode || forwarderBytecode === "0x")
        mismatch("CODE_MISSING", "contracts.forwarder", "deployed bytecode", "0x");
    if (!memeHookBytecode || memeHookBytecode === "0x")
        mismatch("CODE_MISSING", "contracts.memeHook", "deployed bytecode", "0x");
    if (!feeEscrowBytecode || feeEscrowBytecode === "0x")
        mismatch("CODE_MISSING", "contracts.feeEscrow", "deployed bytecode", "0x");
    if (!buybackVaultBytecode || buybackVaultBytecode === "0x")
        mismatch("CODE_MISSING", "contracts.buybackVault", "deployed bytecode", "0x");
    const factoryCodeHash = keccak256(factoryBytecode);
    if (factoryCodeHash !== deployment.factoryRuntimeCodeHash) {
        mismatch("CODE_HASH_MISMATCH", "contracts.factory", deployment.factoryRuntimeCodeHash, factoryCodeHash);
    }
    const forwarderCodeHash = keccak256(forwarderBytecode);
    if (forwarderCodeHash !== deployment.forwarderRuntimeCodeHash) {
        mismatch("CODE_HASH_MISMATCH", "contracts.forwarder", deployment.forwarderRuntimeCodeHash, forwarderCodeHash);
    }
    const memeHookCodeHash = keccak256(memeHookBytecode);
    if (memeHookCodeHash !== deployment.memeHookRuntimeCodeHash)
        mismatch("CODE_HASH_MISMATCH", "contracts.memeHook", deployment.memeHookRuntimeCodeHash, memeHookCodeHash);
    const feeEscrowCodeHash = keccak256(feeEscrowBytecode);
    if (feeEscrowCodeHash !== deployment.feeEscrowRuntimeCodeHash)
        mismatch("CODE_HASH_MISMATCH", "contracts.feeEscrow", deployment.feeEscrowRuntimeCodeHash, feeEscrowCodeHash);
    const buybackVaultCodeHash = keccak256(buybackVaultBytecode);
    if (buybackVaultCodeHash !== deployment.buybackVaultRuntimeCodeHash)
        mismatch("CODE_HASH_MISMATCH", "contracts.buybackVault", deployment.buybackVaultRuntimeCodeHash, buybackVaultCodeHash);
    const factory = deployment.contracts.factory;
    const [forwarder, launchDeployer, graduationExecutor, graduationGuard, poolManager, positionManager, permit2, locker, memeHook, feeEscrow, buybackVault, forwarderFactory] = await Promise.all([
        readAddress(client, factory, "launchForwarder", blockNumber),
        readAddress(client, factory, "launchDeployer", blockNumber),
        readAddress(client, factory, "graduationExecutor", blockNumber),
        readAddress(client, factory, "graduationGuard", blockNumber),
        readAddress(client, factory, "poolManager", blockNumber),
        readAddress(client, factory, "positionManager", blockNumber),
        readAddress(client, factory, "permit2", blockNumber),
        readAddress(client, factory, "locker", blockNumber),
        readAddress(client, factory, "memeHook", blockNumber),
        readAddress(client, factory, "feeEscrow", blockNumber),
        readAddress(client, factory, "buybackVault", blockNumber),
        client.readContract({ address: deployment.contracts.forwarder, abi: ponsForwarderAbi, functionName: "factory", blockNumber }),
    ]);
    const pointers = { factory, forwarder, launchDeployer, graduationExecutor, graduationGuard, poolManager, positionManager, permit2, locker, memeHook, feeEscrow, buybackVault };
    for (const [key, expected] of Object.entries(deployment.contracts)) {
        const actual = pointers[key];
        if (actual.toLowerCase() !== expected.toLowerCase())
            mismatch("POINTER_MISMATCH", `contracts.${key}`, expected, actual);
    }
    if (forwarderFactory.toLowerCase() !== factory.toLowerCase())
        mismatch("POINTER_MISMATCH", "forwarder.factory", factory, forwarderFactory);
    return { chainId, blockNumber, abiRevision: deployment.abiRevision, factoryCodeHash, forwarderCodeHash, memeHookCodeHash, feeEscrowCodeHash, buybackVaultCodeHash, pointers };
}
async function readAddress(client, factory, functionName, blockNumber) {
    return client.readContract({ address: factory, abi: ponsFactoryAbi, functionName, blockNumber });
}
function mismatch(code, path, expected, actual) {
    throw new PonsSdkError(code, `${path} is incompatible: expected ${expected}, got ${actual}`, { path, expected, actual });
}
//# sourceMappingURL=compatibility.js.map