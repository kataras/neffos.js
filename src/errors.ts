// Error types and the error values shared with the Go server.

/**
 * NeffosError is the base class of every error this library creates. `code` is a
 * stable, machine-readable name (for example `ERR_BAD_NAMESPACE` or `ERR_TIMEOUT`);
 * `message` is the human-readable text, which for the shared `Err*` values matches
 * the Go server's error text so it can travel over the wire.
 */
export class NeffosError extends Error {
    readonly code: string;

    constructor(message: string, code: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'NeffosError';
        this.code = code;
    }
}

/**
 * CloseError is an error that closed, or asks to close, the connection. It mirrors
 * Go's `neffos.CloseError`: its message is `"[closeCode] cause message"`, the form the
 * Go server sends, for example `"[-1] write closed"`.
 */
export class CloseError extends NeffosError {
    readonly closeCode: number;
    declare readonly cause: Error;

    constructor(closeCode: number, cause: Error) {
        super(`[${closeCode}] ${cause.message}`, 'ERR_CLOSE', { cause });
        this.name = 'CloseError';
        this.closeCode = closeCode;
    }
}

export const ErrInvalidPayload = new NeffosError("invalid payload", 'ERR_INVALID_PAYLOAD');
export const ErrBadNamespace = new NeffosError("bad namespace", 'ERR_BAD_NAMESPACE');
export const ErrBadRoom = new NeffosError("bad room", 'ERR_BAD_ROOM');
export const ErrClosed = new NeffosError("use of closed connection", 'ERR_CLOSED');
export const ErrWrite = new NeffosError("write closed", 'ERR_WRITE');

/**
 * isCloseError reports whether the given error came from a server shutdown or a
 * forced socket close, rather than from application code.
 */
export function isCloseError(err: unknown): boolean {
    if (err instanceof CloseError) {
        return true;
    }

    return err instanceof Error && err.message.includes("[-1] write closed");
}

/** An error that decides for itself whether an incoming error text means it. */
export interface ErrorResolver {
    resolveError(errorText: string): boolean;
}

// Same list and order as Go's `knownErrors`.
const knownErrors: Error[] = [ErrBadNamespace, ErrBadRoom, ErrWrite, ErrInvalidPayload];

/**
 * registerKnownError adds an error value that both sides know. When an error frame
 * arrives, its text is matched against every known error (by `message`, or by the
 * error's own `resolveError(text)` method if it has one) and the matching value is
 * used as `Message.Err`, so handlers can compare errors with `===`.
 * Mirrors Go's `neffos.RegisterKnownError`.
 */
export function registerKnownError(err: Error & Partial<ErrorResolver>): void {
    if (!knownErrors.includes(err)) {
        knownErrors.push(err);
    }
}

const closeErrorPattern = /^\[(-?\d+)\] ([\s\S]*)$/;

/**
 * resolveError turns an error text received from the server back into an error value.
 * A known error's text gives that same instance. A `"[code] text"` text gives a
 * `CloseError` whose cause is the resolved `text`. Anything else gives a new `Error`.
 * Mirrors Go's `resolveError`, plus the `CloseError` form, which Go sends but does not parse.
 */
export function resolveError(errorText: string): Error {
    for (const known of knownErrors) {
        const resolver = known as Error & Partial<ErrorResolver>;
        if (typeof resolver.resolveError === 'function' && resolver.resolveError(errorText)) {
            return known;
        }
        if (known.message === errorText) {
            return known;
        }
    }

    const m = closeErrorPattern.exec(errorText);
    if (m !== null) {
        return new CloseError(Number(m[1]), resolveError(m[2] ?? ''));
    }

    return new Error(errorText);
}
