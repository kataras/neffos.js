// Wire-format vectors for the neffos message protocol.
//
// The Go vectors are transcribed from C:\github\neffos\message_test.go,
// TestMessageSerialization. Each entry names the Go case it comes from. The JS
// client must produce and accept these frames byte for byte, because the Go
// server is the other end of every connection.
//
// Frame layout: <wait>;<namespace>;<room>;<event>;<isError 0|1>;<isNoOp 0|1>;<body or error text>

/** The fields of a message as a test describes them. Unset fields are empty on the wire. */
export interface MessageFields {
    wait?: string;
    Namespace?: string;
    Room?: string;
    Event?: string;
    Body?: string;
    /** Error text. A message with an error is sent with isError=1 and the text as its body. */
    Err?: string;
    isNoOp?: boolean;
}

export interface SerializeVector {
    /** Go test and case index the vector was copied from. */
    name: string;
    msg: MessageFields;
    wire: string;
}

/** The value of Go's `messageFieldSeparatorReplacement`, used to escape `;` inside fields. */
export const fieldSeparatorReplacement = '@%!semicolon@%!';

export const serializeVectors: SerializeVector[] = [
    {
        name: 'TestMessageSerialization case 0: wait, namespace, room, connect event',
        msg: { Namespace: 'default', Room: 'room1', Event: '_OnNamespaceConnect', wait: '0' },
        wire: '0;default;room1;_OnNamespaceConnect;0;0;',
    },
    {
        name: 'TestMessageSerialization case 1: connect event with a body',
        msg: { Namespace: 'default', Body: 'some id', Event: '_OnNamespaceConnect' },
        wire: ';default;;_OnNamespaceConnect;0;0;some id',
    },
    {
        name: 'TestMessageSerialization case 2: disconnect event, no body',
        msg: { Namespace: 'default', Event: '_OnNamespaceDisconnect' },
        wire: ';default;;_OnNamespaceDisconnect;0;0;',
    },
    {
        name: 'TestMessageSerialization case 3: custom event with a text body',
        msg: { Namespace: 'default', Event: 'chat', Body: 'text' },
        wire: ';default;;chat;0;0;text',
    },
    {
        name: 'TestMessageSerialization case 4: error message',
        msg: { Namespace: 'default', Event: 'chat', Err: 'error message' },
        wire: ';default;;chat;1;0;error message',
    },
    {
        name: 'TestMessageSerialization case 5: body containing separators',
        msg: { Namespace: 'default', Event: 'chat', Body: 'a body with many ; delimeters; like that;' },
        wire: ';default;;chat;0;0;a body with many ; delimeters; like that;',
    },
    {
        name: 'TestMessageSerialization case 6: empty namespace, error text containing separators',
        msg: { Namespace: '', Event: 'chat', Err: 'an error message with many ; delimeters; like that;' },
        wire: ';;;chat;1;0;an error message with many ; delimeters; like that;',
    },
    {
        name: 'TestMessageSerialization case 7: wait and isNoOp',
        msg: { Namespace: 'default', Event: 'chat', Body: 'body', wait: '1', isNoOp: true },
        wire: '1;default;;chat;0;1;body',
    },
];

/** TestMessageSerialization, after the cases: too few fields, so the frame is invalid. */
export const invalidFrame = 'default;chat;';

/** TestMessageSerialization, after the cases: frames accepted as native when native messages are allowed. */
export const nativeFrames = {
    /** `nativeMessage := []byte("a native websocket message")`. */
    plain: 'a native websocket message',
    /**
     * `nativeMessage = []byte("0;if;we;have;same;number;of;message;tokens;this should pass")`.
     * Go only treats this as native when the server handles nothing but native messages
     * (`shouldHandleOnlyNativeMessages`); the JS client has no such mode and parses it as a
     * regular frame because it has the full seven fields.
     */
    sameFieldCount: '0;if;we;have;same;number;of;message;tokens;this should pass',
};

/** TestMessageSerialization, "test escape/unescape": separators inside namespace and room are escaped. */
export const escapedVector: SerializeVector = {
    name: 'TestMessageSerialization escape/unescape',
    msg: { Namespace: 'contains;semi', Room: ';this;for sure;', Event: 'thatdoesnot' },
    wire:
        `;contains${fieldSeparatorReplacement}semi;` +
        `${fieldSeparatorReplacement}this${fieldSeparatorReplacement}for sure${fieldSeparatorReplacement};` +
        'thatdoesnot;0;0;',
};

// JS-only vectors. These are not in message_test.go but follow from the Go server's behaviour.

/** The empty reply the client sends to acknowledge a server ask (Go's `genEmptyReplyToWait`). */
export const emptyReplyVector = { wait: '$abc', wire: '$abc;;;;;;' };

/** Error frames whose text names a known error. Go's `resolveError` maps these back to the error values. */
export const knownErrorFrames = {
    /** Maps to `ErrBadNamespace`. */
    badNamespace: ';default;;chat;1;0;bad namespace',
    /** Sent when the server closes the connection; `isCloseError` must recognise it. */
    writeClosed: ';default;;chat;1;0;[-1] write closed',
};
