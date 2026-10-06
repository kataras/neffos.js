// FakeServer is a scripted neffos server on top of FakeWebSocket. It answers the
// handshake, acknowledges every client ask with an empty reply (as the Go server
// does for connect, disconnect, join and leave), and lets a test override the
// reply per event. It parses frames with its own code, not the client's.

import type { FakeWebSocket, Frame } from './fake-ws';

export interface ParsedFrame {
    wait: string;
    namespace: string;
    room: string;
    event: string;
    isError: boolean;
    isNoOp: boolean;
    body: string;
    /** True if the client sent this as a binary frame. */
    binary: boolean;
}

/**
 * What a responder returns for a client ask:
 * a string replies with that body, an Error replies with an error frame,
 * `undefined` sends the default empty reply, and `null` sends nothing.
 */
export type Responder = (frame: ParsedFrame) => string | Error | undefined | null;

const decoder = new TextDecoder();

function frameToString(data: Frame): string {
    if (typeof data === 'string') {
        return data;
    }
    return decoder.decode(data instanceof Uint8Array ? data : new Uint8Array(data));
}

/** Splits a neffos frame into its seven fields. Returns null for anything else. */
export function parseFrame(data: Frame): ParsedFrame | null {
    const text = frameToString(data);
    const fields: string[] = [];
    let start = 0;
    for (let i = 0; i < 6; i++) {
        const sep = text.indexOf(';', start);
        if (sep === -1) {
            return null;
        }
        fields.push(text.slice(start, sep));
        start = sep + 1;
    }
    const [wait = '', namespace = '', room = '', event = '', isError = '', isNoOp = ''] = fields;
    return {
        wait,
        namespace,
        room,
        event,
        isError: isError === '1',
        isNoOp: isNoOp === '1',
        body: text.slice(start),
        binary: typeof data !== 'string',
    };
}

export interface FakeServerOptions {
    /** Connection ID sent with the handshake acknowledgement. */
    id?: string;
    /** If set, the handshake is refused with this error text. */
    refuse?: string;
}

export class FakeServer {
    readonly id: string;
    /** Every neffos frame received from any attached socket, in order. */
    readonly received: ParsedFrame[] = [];
    private readonly responders = new Map<string, Responder>();
    private readonly refuse: string | undefined;

    constructor(options: FakeServerOptions = {}) {
        this.id = options.id ?? 'conn-id-1';
        this.refuse = options.refuse;
    }

    /** Overrides the reply to client asks for `event`. */
    on(event: string, responder: Responder): this {
        this.responders.set(event, responder);
        return this;
    }

    attach(ws: FakeWebSocket): void {
        ws.onClientSend = (data) => {
            // Reply on a later microtask, like a network round trip.
            queueMicrotask(() => this.handle(ws, data));
        };
    }

    private handle(ws: FakeWebSocket, data: Frame): void {
        if (data === 'M') {
            ws.serverSend(this.refuse !== undefined ? 'H' + this.refuse : 'A' + this.id);
            return;
        }

        const frame = parseFrame(data);
        if (frame === null) {
            return;
        }
        this.received.push(frame);

        // Only client asks (wait starting with "$") expect an answer.
        if (!frame.wait.startsWith('$')) {
            return;
        }

        const responder = this.responders.get(frame.event);
        const result = responder ? responder(frame) : undefined;
        if (result === null) {
            return;
        }
        if (result === undefined) {
            ws.serverSend(frame.wait + ';;;;;;');
            return;
        }
        const isError = result instanceof Error;
        const body = isError ? result.message : result;
        ws.serverSend([frame.wait, frame.namespace, frame.room, frame.event, isError ? '1' : '0', '0', body].join(';'));
    }
}
