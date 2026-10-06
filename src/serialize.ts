// Converts between Message objects and wire frames.

import { resolveError } from './errors';
import { Message, isReply, type WSData } from './message';
import {
    OnNativeMessage,
    escapeMessageField,
    falseString,
    messageSeparator,
    splitN,
    trueString,
    unescapeMessageField,
    validMessageSepCount,
    waitComesFromClientPrefix,
} from './protocol';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8");
const messageSeparatorCharCode = messageSeparator.charCodeAt(0);

function toBytes(data: WSData): Uint8Array {
    return typeof data === 'string' ? textEncoder.encode(data) : data;
}

function toText(data: WSData): string {
    return typeof data === 'string' ? data : textDecoder.decode(data);
}

export function serializeMessage(msg: Message): string | Uint8Array {
    if (msg.IsNative && msg.wait === "") {
        return msg.Body;
    }

    let isErrorString = falseString;
    let body: WSData = msg.Body;

    if (msg.Err !== undefined && msg.Err.message !== "") {
        body = msg.Err.message;
        if (!isReply(msg.Err)) {
            isErrorString = trueString;
        }
    }

    const header = [
        msg.wait,
        escapeMessageField(msg.Namespace),
        escapeMessageField(msg.Room),
        escapeMessageField(msg.Event),
        isErrorString,
        msg.isNoOp ? trueString : falseString,
        "" // body
    ].join(messageSeparator);

    if (msg.SetBinary) {
        const head = textEncoder.encode(header);
        const tail = toBytes(body);
        const data = new Uint8Array(head.length + tail.length);
        data.set(head, 0);
        data.set(tail, head.length);
        return data;
    }

    return header + toText(body);
}

function nativeMessage(body: WSData): Message {
    const msg = new Message();
    msg.Event = OnNativeMessage;
    msg.Body = body;
    msg.IsNative = true;
    msg.SetBinary = typeof body !== 'string';
    return msg;
}

function invalidMessage(): Message {
    const msg = new Message();
    msg.isInvalid = true;
    return msg;
}

// <wait>;
// <namespace>;
// <room>;
// <event>;
// <isError(0-1)>;
// <isNoOp(0-1)>;
// <body||error_message>
//
// Text frames arrive as strings, binary frames as an ArrayBuffer (`binaryType =
// "arraybuffer"`) or a Uint8Array. A frame that is not a neffos frame becomes an
// `OnNativeMessage` message when `allowNativeMessages` is true, and is invalid otherwise.
export function deserializeMessage(data: unknown, allowNativeMessages: boolean): Message {
    if (typeof data === 'string') {
        return deserializeText(data, allowNativeMessages);
    }
    if (data instanceof ArrayBuffer) {
        return deserializeBinary(new Uint8Array(data), allowNativeMessages);
    }
    if (ArrayBuffer.isView(data)) {
        return deserializeBinary(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), allowNativeMessages);
    }
    return invalidMessage();
}

function deserializeText(data: string, allowNativeMessages: boolean): Message {
    if (data.length === 0) {
        return invalidMessage();
    }

    const fields = splitN(data, messageSeparator, validMessageSepCount - 1);
    if (fields.length !== validMessageSepCount) {
        return allowNativeMessages ? nativeMessage(data) : invalidMessage();
    }

    const [wait = "", namespace = "", room = "", event = "", isError = "", isNoOp = "", body = ""] = fields;
    return buildMessage(wait, namespace, room, event, isError, isNoOp, body, allowNativeMessages);
}

function deserializeBinary(arr: Uint8Array, allowNativeMessages: boolean): Message {
    if (arr.length === 0) {
        return invalidMessage();
    }

    // The header ends at the sixth separator; everything after it is the body, kept as bytes.
    let seps = 0;
    let headerEnd = -1;
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] === messageSeparatorCharCode) {
            seps++;
            if (seps === validMessageSepCount - 1) {
                headerEnd = i;
                break;
            }
        }
    }

    if (headerEnd === -1) {
        return allowNativeMessages ? nativeMessage(arr.slice()) : invalidMessage();
    }

    // Header fields are escaped, so they hold no separator: a plain split gives exactly six.
    const [wait = "", namespace = "", room = "", event = "", isError = "", isNoOp = ""] =
        textDecoder.decode(arr.subarray(0, headerEnd)).split(messageSeparator);
    const msg = buildMessage(wait, namespace, room, event, isError, isNoOp, arr.slice(headerEnd + 1), allowNativeMessages);
    msg.SetBinary = true;
    return msg;
}

function buildMessage(
    wait: string,
    namespace: string,
    room: string,
    event: string,
    isError: string,
    isNoOp: string,
    body: WSData,
    allowNativeMessages: boolean,
): Message {
    const msg = new Message();
    msg.wait = wait;
    msg.Namespace = unescapeMessageField(namespace);
    msg.Room = unescapeMessageField(room);
    msg.Event = unescapeMessageField(event);
    msg.isError = isError === trueString;
    msg.isNoOp = isNoOp === trueString;
    if (msg.isError) {
        const text = toText(body);
        if (text !== "") {
            msg.Err = resolveError(text);
        }
    } else {
        msg.Body = body;
    }
    msg.IsNative = allowNativeMessages && msg.Event === OnNativeMessage;
    return msg;
}

function randomBase36(length: number): string {
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);
    let out = "";
    for (const b of bytes) {
        out += (b % 36).toString(36);
    }
    return out;
}

/**
 * createWaitGenerator returns a function that makes wait ids for client asks:
 * `"$"`, then eight random base-36 characters fixed for this generator, then a
 * base-36 counter. The ids are unique for the generator's lifetime and unlikely to
 * collide across generators. The second character is never `"!"`, which the Go
 * server reads as the stack-exchange marker.
 */
export function createWaitGenerator(): () => string {
    const prefix = waitComesFromClientPrefix + randomBase36(8);
    let counter = 0;
    return () => {
        counter++;
        return prefix + counter.toString(36);
    };
}

/** genWait makes a wait id from a generator shared by the whole module. */
export const genWait: () => string = createWaitGenerator();
