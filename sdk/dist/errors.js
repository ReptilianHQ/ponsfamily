export class PonsSdkError extends Error {
    code;
    path;
    expected;
    actual;
    constructor(code, message, options = {}) {
        super(message);
        this.code = code;
        this.name = "PonsSdkError";
        this.path = options.path;
        this.expected = options.expected;
        this.actual = options.actual;
        if (options.cause !== undefined)
            this.cause = options.cause;
    }
    toJSON() {
        return Object.fromEntries(Object.entries({
            name: this.name,
            code: this.code,
            message: this.message,
            path: this.path,
            expected: this.expected,
            actual: this.actual,
        }).filter((entry) => entry[1] !== undefined));
    }
}
export function isPonsSdkError(error) {
    return error instanceof PonsSdkError;
}
//# sourceMappingURL=errors.js.map