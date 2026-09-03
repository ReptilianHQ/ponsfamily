import { ABI_REVISION } from "./abis.js";
import { getPonsDeployment } from "./deployments.js";
export const PONS_INDEXING_MANIFEST_VERSION = 1;
const EVENTS = {
    PonsV2Factory: [
        "TokenLaunched",
        "LaunchSwept",
        "CreatorFeeRecipientUpdated",
        "BuybackEnabledUpdated",
        "PoolGraduated",
        "LaunchGraduationRescued",
    ],
    PonsV2Curve: [
        "CurveBuy",
        "CurveBuyRefunded",
        "CurveSell",
        "FeesSwept",
        "BuybackLocked",
        "CurveCompleted",
    ],
    PonsV2MemeHook: [
        "PoolRegistered",
        "ProtocolFeeRecipientUpdated",
        "HookFeeCollected",
        "PoolFeesSwept",
        "PoolFeesRescued",
    ],
    PonsV2FeeEscrow: ["Claimed", "ClaimedToken", "Credited", "CreditedToken"],
    PonsV2BuybackVault: ["Locked", "Released", "CreatorRecipientUpdated"],
    PonsLaunchToken: ["Transfer"],
    UniswapV4PoolManager: ["Initialize", "Swap"],
};
const contracts = Object.entries(EVENTS)
    .map(([name, events]) => ({
    name,
    artifact: `@reptilianhq/pons-sdk/artifacts/${name}.json`,
    events,
}));
/**
 * Returns the versioned public-event topology for a Pons deployment.
 *
 * Consumers remain responsible for Envio runtime tuning, persistence, pricing,
 * wallet attribution, and which advertised events they choose to subscribe to.
 */
export function getPonsIndexingManifest(chainId = 4663) {
    const deployment = getPonsDeployment(chainId);
    const { startBlock } = deployment;
    return deepFreeze({
        schemaVersion: PONS_INDEXING_MANIFEST_VERSION,
        abiRevision: ABI_REVISION,
        coverage: "pons-v2-public-events",
        chainId,
        startBlock,
        hypersyncUrl: `https://${chainId}.hypersync.xyz`,
        contracts,
        sources: [
            fixed("PonsV2Factory", deployment.contracts.factory, startBlock, deployment.factoryRuntimeCodeHash),
            fixed("PonsV2MemeHook", deployment.contracts.memeHook, startBlock, deployment.memeHookRuntimeCodeHash),
            fixed("PonsV2FeeEscrow", deployment.contracts.feeEscrow, startBlock, deployment.feeEscrowRuntimeCodeHash),
            fixed("PonsV2BuybackVault", deployment.contracts.buybackVault, startBlock, deployment.buybackVaultRuntimeCodeHash),
            fixed("UniswapV4PoolManager", deployment.contracts.poolManager, startBlock),
            dynamic("PonsV2Curve", "curve"),
            dynamic("PonsLaunchToken", "token"),
        ],
    });
}
function fixed(contract, address, startBlock, expectedRuntimeCodeHash) {
    return { kind: "fixed", contract, address, startBlock, expectedRuntimeCodeHash };
}
function dynamic(contract, addressParameter) {
    return {
        kind: "dynamic",
        contract,
        registeredBy: { contract: "PonsV2Factory", event: "TokenLaunched", addressParameter },
    };
}
function deepFreeze(value) {
    if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
        for (const child of Object.values(value))
            deepFreeze(child);
        Object.freeze(value);
    }
    return value;
}
//# sourceMappingURL=indexing.js.map