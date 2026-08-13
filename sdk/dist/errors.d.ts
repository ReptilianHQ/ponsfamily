export type PonsSdkErrorCode = "ABI_REVISION_MISMATCH" | "ARITHMETIC_OVERFLOW" | "CALLDATA_MISMATCH" | "CHAIN_MISMATCH" | "CODE_HASH_MISMATCH" | "CODE_MISSING" | "DEPLOYMENT_NOT_FOUND" | "EVENT_NOT_FOUND" | "INVALID_ADDRESS" | "INVALID_ARGUMENT" | "OUTPUT_BELOW_MINIMUM" | "POINTER_MISMATCH" | "RECEIPT_FIELD_MISMATCH" | "RECEIPT_REVERTED" | "UNEXPECTED_SENDER" | "UNEXPECTED_TARGET" | "UNEXPECTED_VALUE" | "UNSUPPORTED_CHAIN";
export interface PonsSdkErrorOptions {
    path?: string;
    expected?: string;
    actual?: string;
    cause?: unknown;
}
export declare class PonsSdkError extends Error {
    readonly code: PonsSdkErrorCode;
    readonly path?: string;
    readonly expected?: string;
    readonly actual?: string;
    constructor(code: PonsSdkErrorCode, message: string, options?: PonsSdkErrorOptions);
    toJSON(): Record<string, string>;
}
export declare function isPonsSdkError(error: unknown): error is PonsSdkError;
