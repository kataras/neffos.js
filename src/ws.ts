// Picks the WebSocket constructor at run time: `Options.WebSocket`, then
// `globalThis.WebSocket`, then the optional `ws` package (Node builds only).

import { NeffosError } from './errors';

/**
 * Handler properties are written with method syntax so their parameter is checked
 * bivariantly. That lets the browser `WebSocket`, the `ws` package and test fakes,
 * whose handlers take their own event types, all count as a `WebSocketLike`.
 */
type SocketHandler<E> = { handle(ev: E): unknown }['handle'] | null;

/** The part of a WebSocket that neffos uses. Browser, Node and `ws` sockets all fit. */
export interface WebSocketLike {
    readonly readyState: number;
    binaryType: string;
    onopen: SocketHandler<unknown>;
    onmessage: SocketHandler<{ data: unknown }>;
    onerror: SocketHandler<unknown>;
    onclose: SocketHandler<{ code: number; reason: string; wasClean: boolean }>;
    send(data: string | Uint8Array): void;
    close(code?: number, reason?: string): void;
}

/**
 * A WebSocket constructor. The third argument is only passed to the `ws` package's
 * constructor, which accepts `{ headers }`.
 */
export type WebSocketConstructor = new (
    url: string,
    protocols?: string | string[],
    options?: { headers?: Record<string, string> },
) => WebSocketLike;

export interface ResolvedWebSocket {
    WebSocket: WebSocketConstructor;
    /** True when the constructor is the `ws` package's, which can send real request headers. */
    supportsHeaders: boolean;
}

/** isWsPackage reports whether `ctor` looks like the `ws` package's WebSocket (it has `terminate`). */
function isWsPackage(ctor: WebSocketConstructor): boolean {
    const proto: unknown = ctor.prototype;
    return typeof proto === 'object' && proto !== null && typeof (proto as { terminate?: unknown }).terminate === 'function';
}

/**
 * resolveWebSocket returns the WebSocket constructor to use, in this order: `custom`
 * (from `Options.WebSocket`), `globalThis.WebSocket`, then the `ws` package loaded
 * with a dynamic import. The last step does not exist in the browser builds.
 * Rejects with a `NeffosError` (code `ERR_NO_WEBSOCKET`) when none is available.
 */
export async function resolveWebSocket(custom?: WebSocketConstructor): Promise<ResolvedWebSocket> {
    if (custom !== undefined) {
        return { WebSocket: custom, supportsHeaders: isWsPackage(custom) };
    }

    const native: unknown = (globalThis as { WebSocket?: unknown }).WebSocket;
    if (typeof native === 'function') {
        return { WebSocket: native as WebSocketConstructor, supportsHeaders: false };
    }

    if (!__NEFFOS_BROWSER_BUILD__) {
        try {
            const mod = await import('ws');
            const ctor: unknown = mod.WebSocket ?? mod.default;
            if (typeof ctor === 'function') {
                return { WebSocket: ctor as WebSocketConstructor, supportsHeaders: true };
            }
        } catch {
            // `ws` is an optional peer dependency; fall through to the error below.
        }
    }

    throw new NeffosError(
        "no WebSocket implementation found: pass Options.WebSocket, run where globalThis.WebSocket exists, or install the ws package",
        'ERR_NO_WEBSOCKET',
    );
}
