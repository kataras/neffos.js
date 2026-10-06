// Wire-protocol constants and helpers shared with the Go server. They must match
// the server side byte for byte.

/* The OnNamespaceConnect is the event name that it's fired on before namespace connect. */
export const OnNamespaceConnect = "_OnNamespaceConnect";
/* The OnNamespaceConnected is the event name that it's fired on after namespace connect. */
export const OnNamespaceConnected = "_OnNamespaceConnected";
/* The OnNamespaceDisconnect is the event name that it's fired on namespace disconnected. */
export const OnNamespaceDisconnect = "_OnNamespaceDisconnect";
/* The OnRoomJoin is the event name that it's fired on before room join. */
export const OnRoomJoin = "_OnRoomJoin";
/* The OnRoomJoined is the event name that it's fired on after room join. */
export const OnRoomJoined = "_OnRoomJoined";
/* The OnRoomLeave is the event name that it's fired on before room leave. */
export const OnRoomLeave = "_OnRoomLeave";
/* The OnRoomLeft is the event name that it's fired on after room leave. */
export const OnRoomLeft = "_OnRoomLeft";
/* The OnAnyEvent is the event name that it's fired, if no incoming event was registered, it's a "wildcard". */
export const OnAnyEvent = "_OnAnyEvent";
/* The OnNativeMessage is the event name, which if registered on empty ("") namespace
   it accepts native messages(Message.Body and Message.IsNative is filled only). */
export const OnNativeMessage = "_OnNativeMessage";

export const ackBinary = 'M'; // see `onopen`, comes from client to server at startup.
export const ackIDBinary = 'A'; // comes from server to client after ackBinary; the rest of the payload is the conn's ID.
export const ackNotOKBinary = 'H'; // comes from server to client if `Server#OnConnect` errored; the rest is the error text.

export const waitIsConfirmationPrefix = '#';
export const waitComesFromClientPrefix = '$';

/**
 * isSystemEvent reports whether the given event name is one of the built-in
 * system events fired by the neffos protocol itself
 * (connect, connected, disconnect, room join/joined/leave/left).
 */
export function isSystemEvent(event: string): boolean {
    switch (event) {
        case OnNamespaceConnect:
        case OnNamespaceConnected:
        case OnNamespaceDisconnect:
        case OnRoomJoin:
        case OnRoomJoined:
        case OnRoomLeave:
        case OnRoomLeft:
            return true;
        default:
            return false;
    }
}

/* The wire-format constants must match the server side exactly. */
export const messageSeparator = ';';
export const messageFieldSeparatorReplacement = "@%!semicolon@%!";
export const validMessageSepCount = 7;
export const trueString = "1";
export const falseString = "0";

const escapeRegExp = new RegExp(messageSeparator, "g");
export function escapeMessageField(s: string): string {
    if (!s) {
        return "";
    }

    return s.replace(escapeRegExp, messageFieldSeparatorReplacement);
}


const unescapeRegExp = new RegExp(messageFieldSeparatorReplacement, "g");
export function unescapeMessageField(s: string): string {
    if (!s) {
        return "";
    }

    return s.replace(unescapeRegExp, messageSeparator);
}

// splitN splits `s` at the first `limit` separators and keeps the rest, separators
// included, as the last element, so a full split has `limit + 1` elements. If `s` has
// fewer than `limit` separators it is returned whole. This is Go's
// `bytes.SplitN(s, sep, limit + 1)` with the "not enough fields" case folded into one
// element, which is all the frame parser needs to tell a frame from a native message.
export function splitN(s: string, sep: string, limit: number): string[] {
    if (limit === 0) return [s];
    const out: string[] = [];
    let start = 0;
    for (let i = 0; i < limit; i++) {
        const idx = s.indexOf(sep, start);
        if (idx === -1) {
            return [s];
        }
        out.push(s.slice(start, idx));
        start = idx + sep.length;
    }
    out.push(s.slice(start));
    return out;
}

export function genEmptyReplyToWait(wait: string): string {
    return wait + messageSeparator.repeat(validMessageSepCount - 1);
}

/* URLParamAsHeaderPrefix is the prefix added to `Options.headers` entries when they are
   sent as URL parameters. The server turns these parameters back into request headers.
   Browsers cannot set headers on a WebSocket handshake, so this is the usual workaround.
   It must match the server's `URLParamAsHeaderPrefix`. Clients that use the `ws` package
   send real headers instead. */
export const URLParamAsHeaderPrefix = "X-Websocket-Header-";

// This header key must match the server's `websocketReconectHeaderKey` constant.
export const websocketReconnectHeaderKey = 'X-Websocket-Reconnect';
