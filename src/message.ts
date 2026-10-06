// The Message type and the helpers users call on message bodies.

import {
    OnNamespaceConnect,
    OnNamespaceDisconnect,
    OnRoomJoin,
    OnRoomLeft,
} from './protocol';

/* WSData is a message body: a string for text frames, bytes for binary frames. */
export type WSData = string | Uint8Array;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8");

/* The Message is the structure which describes the incoming data (and outgoing when `Conn.Write` is used directly). */
export class Message {
    wait = "";
    /* The Namespace that this message sent to. */
    Namespace = "";
    /* The Room that this message sent to. */
    Room = "";
    /* The Event that this message sent to. */
    Event = "";
    /* The actual body of the incoming data. A string for text frames, a Uint8Array for binary frames. */
    Body: WSData = "";
    /* The Err contains the message's error, if any.
       Server-side and client-side can return an error instead of a message from inside event callbacks. */
    Err: Error | undefined = undefined;

    isError = false;
    isNoOp = false;

    isInvalid = false;
    /* IsForced is true when this is a force action (e.g. connection lost remotely fires
       `OnNamespaceDisconnect` with IsForced=true). */
    IsForced = false;
    /* IsLocal reports whether the event was triggered by the client side itself (e.g. when
       `connect` triggers `OnNamespaceConnect` locally). The server side can force-connect a
       client, in which case `IsLocal` is false. */
    IsLocal = false;
    /* IsNative reports whether the message is a raw native websocket message
       (only `Body` is filled). */
    IsNative = false;

    /* SetBinary is true if the client must send this message as a binary frame. */
    SetBinary = false;

    isConnect(): boolean {
        return this.Event === OnNamespaceConnect;
    }

    isDisconnect(): boolean {
        return this.Event === OnNamespaceDisconnect;
    }

    isRoomJoin(): boolean {
        return this.Event === OnRoomJoin;
    }

    isRoomLeft(): boolean {
        return this.Event === OnRoomLeft;
    }

    /**
     * isWait reports whether this message belongs to an ask: any non-empty wait counts,
     * as in Go's `Message.IsWait` on the client side.
     */
    isWait(): boolean {
        return this.wait !== "";
    }

    /** text returns `Body` as a string, decoding it as UTF-8 if it holds bytes. */
    text(): string {
        return typeof this.Body === 'string' ? this.Body : textDecoder.decode(this.Body);
    }

    /** bytes returns `Body` as bytes, encoding it as UTF-8 if it holds a string. */
    bytes(): Uint8Array {
        return typeof this.Body === 'string' ? textEncoder.encode(this.Body) : this.Body;
    }

    /**
     * unmarshal returns this Message's `Body` parsed as JSON. Equivalent to
     * Go's `neffos.Message.Unmarshal`. Throws on invalid JSON.
     *
     * See library-level `marshal` function too.
     */
    // `any` as the default matches `JSON.parse` and keeps 0.2.0 callers such as
    // `msg.unmarshal().name` compiling; pass a type argument to get a checked result.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unmarshal<T = any>(): T {
        return JSON.parse(this.text()) as T;
    }
}

/** copyMessage returns a shallow copy of `msg` with `changes` applied. */
export function copyMessage(msg: Message, changes: Partial<Message> = {}): Message {
    return Object.assign(new Message(), msg, changes);
}

/**
 * marshal serializes an object to a string for use in Message.Body.
 * Equivalent to Go's `neffos.Marshal`. See `Message.unmarshal` too.
 */
export function marshal(obj: unknown): string {
    return JSON.stringify(obj);
}

/**
 * ReplyError is what `reply(body)` returns. A handler that returns it sends `body`
 * back to the sender as a normal message, not as an error.
 */
export class ReplyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ReplyError';
    }
}

/**
 * reply is a sentinel-error helper: returning `reply(body)` from a message
 * handler tells neffos to echo `body` back to the sender with the same
 * Namespace and Event (rather than treating the return value as a transport
 * error). This is the JS analogue of Go's `neffos.Reply`. A byte body is sent
 * as its UTF-8 text.
 */
export function reply(body: WSData): Error {
    return new ReplyError(typeof body === 'string' ? body : textDecoder.decode(body));
}

export function isReply(err: Error): boolean {
    return err instanceof ReplyError;
}
