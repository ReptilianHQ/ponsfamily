export type PonsSdkErrorCode =
  | "ABI_REVISION_MISMATCH"
  | "ARITHMETIC_OVERFLOW"
  | "CALLDATA_MISMATCH"
  | "CHAIN_MISMATCH"
  | "CODE_HASH_MISMATCH"
  | "CODE_MISSING"
  | "DEPLOYMENT_NOT_FOUND"
  | "EVENT_NOT_FOUND"
  | "INVALID_ADDRESS"
  | "INVALID_ARGUMENT"
  | "OUTPUT_BELOW_MINIMUM"
  | "POINTER_MISMATCH"
  | "PROJECTION_INVARIANT"
  | "PROJECTION_LIFECYCLE_TRANSITION"
  | "PROJECTION_RESERVE_UNDERFLOW"
  | "RECEIPT_FIELD_MISMATCH"
  | "RECEIPT_REVERTED"
  | "SWAP_SHAPE"
  | "UNEXPECTED_SENDER"
  | "UNEXPECTED_TARGET"
  | "UNEXPECTED_VALUE"
  | "UNSUPPORTED_CHAIN";

export interface PonsSdkErrorOptions {
  path?: string;
  expected?: string;
  actual?: string;
  cause?: unknown;
}

export class PonsSdkError extends Error {
  public readonly path?: string;
  public readonly expected?: string;
  public readonly actual?: string;

  constructor(
    public readonly code: PonsSdkErrorCode,
    message: string,
    options: PonsSdkErrorOptions = {},
  ) {
    super(message);
    this.name = "PonsSdkError";
    this.path = options.path;
    this.expected = options.expected;
    this.actual = options.actual;
    if (options.cause !== undefined) this.cause = options.cause;
  }

  toJSON(): Record<string, string> {
    return Object.fromEntries(Object.entries({
      name: this.name,
      code: this.code,
      message: this.message,
      path: this.path,
      expected: this.expected,
      actual: this.actual,
    }).filter((entry): entry is [string, string] => entry[1] !== undefined));
  }
}

export function isPonsSdkError(error: unknown): error is PonsSdkError {
  return error instanceof PonsSdkError;
}
