import { describe, expect, test } from 'vitest';
import { CloseError, ErrBadNamespace, ErrWrite, isCloseError } from '../src/errors';
import { Message, reply } from '../src/message';
import { OnNativeMessage } from '../src/protocol';
import { deserializeMessage, serializeMessage } from '../src/serialize';
import {
    escapedVector,
    invalidFrame,
    knownErrorFrames,
    nativeFrames,
    serializeVectors,
    type MessageFields,
} from './golden/messages';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function buildMessage(fields: MessageFields): Message {
    const msg = new Message();
    msg.wait = fields.wait ?? '';
    msg.Namespace = fields.Namespace ?? '';
    msg.Room = fields.Room ?? '';
    msg.Event = fields.Event ?? '';
    msg.Body = fields.Body ?? '';
    if (fields.Err !== undefined) {
        msg.Err = new Error(fields.Err);
    }
    msg.isNoOp = fields.isNoOp ?? false;
    return msg;
}

/** The fields of a decoded message, in the shape of the golden vectors. */
function fieldsOf(msg: Message): MessageFields {
    const fields: MessageFields = {
        wait: msg.wait,
        Namespace: msg.Namespace,
        Room: msg.Room,
        Event: msg.Event,
        isNoOp: msg.isNoOp,
    };
    if (msg.isError) {
        fields.Err = msg.Err?.message;
    } else {
        fields.Body = msg.text();
    }
    return fields;
}

function expectedFields(fields: MessageFields): MessageFields {
    const out: MessageFields = {
        wait: fields.wait ?? '',
        Namespace: fields.Namespace ?? '',
        Room: fields.Room ?? '',
        Event: fields.Event ?? '',
        isNoOp: fields.isNoOp ?? false,
    };
    if (fields.Err !== undefined) {
        out.Err = fields.Err;
    } else {
        out.Body = fields.Body ?? '';
    }
    return out;
}

function bufferOf(text: string): ArrayBuffer {
    const bytes = encoder.encode(text);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe('golden vectors from message_test.go', () => {
    describe.each([...serializeVectors, escapedVector])('$name', (vector) => {
        test('serializes to the Go wire frame', () => {
            expect(serializeMessage(buildMessage(vector.msg))).toBe(vector.wire);
        });

        test('deserializes the Go wire frame', () => {
            const msg = deserializeMessage(vector.wire, false);
            expect(msg.isInvalid).toBe(false);
            expect(msg.IsNative).toBe(false);
            expect(fieldsOf(msg)).toEqual(expectedFields(vector.msg));
        });

        test('round-trips byte for byte', () => {
            expect(serializeMessage(deserializeMessage(vector.wire, false))).toBe(vector.wire);
        });
    });

    test('a frame with too few fields is invalid', () => {
        expect(deserializeMessage(invalidFrame, false).isInvalid).toBe(true);
    });

    test('a plain native message is accepted when native messages are allowed', () => {
        const msg = deserializeMessage(nativeFrames.plain, true);
        expect(msg.isInvalid).toBe(false);
        expect(msg.IsNative).toBe(true);
        expect(msg.Namespace).toBe('');
        expect(msg.Event).toBe(OnNativeMessage);
        expect(msg.Body).toBe(nativeFrames.plain);
    });

    test('a plain native message is invalid when native messages are not allowed', () => {
        expect(deserializeMessage(nativeFrames.plain, false).isInvalid).toBe(true);
    });

    test('a native message with seven or more fields is still accepted when native messages are allowed', () => {
        // Go additionally marks it native when the server handles only native messages; the JS
        // client has no such mode, so this only checks the frame is not rejected.
        expect(deserializeMessage(nativeFrames.sameFieldCount, true).isInvalid).toBe(false);
    });

    // Go's bytes.SplitN returns six fields here, so the frame is invalid.
    test('a frame with only six fields is invalid, as in Go', () => {
        expect(deserializeMessage(';default;;chat;0;0', false).isInvalid).toBe(true);
    });

    test('a frame with only six fields is a native message when native messages are allowed', () => {
        const msg = deserializeMessage(';default;;chat;0;0', true);
        expect(msg.isInvalid).toBe(false);
        expect(msg.IsNative).toBe(true);
        expect(msg.Body).toBe(';default;;chat;0;0');
    });

    test('an empty frame is invalid', () => {
        expect(deserializeMessage('', true).isInvalid).toBe(true);
        expect(deserializeMessage(new ArrayBuffer(0), true).isInvalid).toBe(true);
    });
});

describe('binary frames', () => {
    const textVectors = serializeVectors.filter((v) => v.msg.Err === undefined);

    test.each(textVectors)('$name: a Uint8Array body serializes to the same bytes', (vector) => {
        const msg = buildMessage(vector.msg);
        msg.Body = encoder.encode(vector.msg.Body ?? '');
        msg.SetBinary = true;
        const out = serializeMessage(msg);
        expect(out).toBeInstanceOf(Uint8Array);
        expect(decoder.decode(out as Uint8Array)).toBe(vector.wire);
    });

    test.each(textVectors)('$name: an ArrayBuffer frame deserializes with the body kept as bytes', (vector) => {
        const msg = deserializeMessage(bufferOf(vector.wire), false);
        expect(msg.isInvalid).toBe(false);
        expect(msg.SetBinary).toBe(true);
        expect(msg.Namespace).toBe(vector.msg.Namespace ?? '');
        expect(msg.Room).toBe(vector.msg.Room ?? '');
        expect(msg.Event).toBe(vector.msg.Event ?? '');
        expect(msg.wait).toBe(vector.msg.wait ?? '');
        expect(msg.isNoOp).toBe(vector.msg.isNoOp ?? false);
        expect(msg.Body).toBeInstanceOf(Uint8Array);
        expect(msg.text()).toBe(vector.msg.Body ?? '');
        expect(serializeMessage(msg)).toEqual(encoder.encode(vector.wire));
    });

    test('an ArrayBuffer frame with too few separators is invalid when native messages are off', () => {
        expect(deserializeMessage(bufferOf(invalidFrame), false).isInvalid).toBe(true);
    });

    test('a Uint8Array frame deserializes like an ArrayBuffer frame', () => {
        const msg = deserializeMessage(encoder.encode(';default;;chat;0;0;hi'), false);
        expect(msg.isInvalid).toBe(false);
        expect(msg.SetBinary).toBe(true);
        expect(msg.text()).toBe('hi');
    });

    test('a binary body may contain separators and any byte', () => {
        const body = new Uint8Array([0x3b, 0x00, 0xff, 0x3b, 0x41]);
        const msg = buildMessage({ Namespace: 'default', Event: 'blob' });
        msg.Body = body;
        msg.SetBinary = true;
        const out = serializeMessage(msg) as Uint8Array;
        const back = deserializeMessage(out, false);
        expect(back.Event).toBe('blob');
        expect(back.Body).toEqual(body);
    });

    test('a native binary frame is accepted when native messages are allowed', () => {
        const msg = deserializeMessage(bufferOf('raw bytes'), true);
        expect(msg.isInvalid).toBe(false);
        expect(msg.IsNative).toBe(true);
        expect(msg.SetBinary).toBe(true);
        expect(msg.Event).toBe(OnNativeMessage);
        expect(msg.Body).toEqual(encoder.encode('raw bytes'));
    });

    test('a binary frame with only five separators is native when native messages are allowed', () => {
        const msg = deserializeMessage(bufferOf(';default;;chat;0;0'), true);
        expect(msg.IsNative).toBe(true);
        expect(msg.text()).toBe(';default;;chat;0;0');
    });

    test('a string body on a binary message is sent as its UTF-8 bytes', () => {
        const msg = buildMessage({ Namespace: 'default', Event: 'chat', Body: 'h\u00e9llo' });
        msg.SetBinary = true;
        const out = serializeMessage(msg);
        expect(out).toEqual(encoder.encode(';default;;chat;0;0;h\u00e9llo'));
        expect(decoder.decode(out as Uint8Array)).toBe(';default;;chat;0;0;h\u00e9llo');
    });

    test('a native message is sent as its body alone', () => {
        const msg = new Message();
        msg.IsNative = true;
        msg.Body = 'raw';
        expect(serializeMessage(msg)).toBe('raw');
    });
});

describe('errors on the wire', () => {
    test('reply(body) is sent as a normal body, not as an error', () => {
        const msg = buildMessage({ Namespace: 'default', Event: 'chat' });
        msg.Err = reply('pong');
        expect(serializeMessage(msg)).toBe(';default;;chat;0;0;pong');
    });

    test('"[-1] write closed" becomes a CloseError around ErrWrite', () => {
        const msg = deserializeMessage(knownErrorFrames.writeClosed, false);
        expect(msg.isError).toBe(true);
        expect(isCloseError(msg.Err)).toBe(true);
        expect(msg.Err).toBeInstanceOf(CloseError);
        expect((msg.Err as CloseError).closeCode).toBe(-1);
        expect((msg.Err as CloseError).cause).toBe(ErrWrite);
        expect(msg.Err?.message).toBe('[-1] write closed');
    });

    test('a binary error frame resolves its text the same way', () => {
        const msg = deserializeMessage(bufferOf(knownErrorFrames.badNamespace), false);
        expect(msg.Err).toBe(ErrBadNamespace);
    });

    test('a known error serializes back to the same frame', () => {
        expect(serializeMessage(deserializeMessage(knownErrorFrames.badNamespace, false))).toBe(knownErrorFrames.badNamespace);
        expect(serializeMessage(deserializeMessage(knownErrorFrames.writeClosed, false))).toBe(knownErrorFrames.writeClosed);
    });

    test('other error text is not a close error', () => {
        const msg = deserializeMessage(knownErrorFrames.badNamespace, false);
        expect(isCloseError(msg.Err)).toBe(false);
    });

    test('"bad namespace" maps to ErrBadNamespace', () => {
        const msg = deserializeMessage(knownErrorFrames.badNamespace, false);
        expect(msg.Err).toBe(ErrBadNamespace);
    });
});
