// neffos.js public API. The script-tag builds expose these exports as the global `neffos`.

export { dial, type Options, type ReconnectOptions } from './dial';
export { Conn, type AskOptions, type CloseInfo } from './conn';
export { NSConn } from './nsconn';
export { Room } from './room';
export { Message, ReplyError, marshal, reply, type WSData } from './message';
export {
    NeffosError,
    CloseError,
    ErrInvalidPayload,
    ErrBadNamespace,
    ErrBadRoom,
    ErrClosed,
    ErrWrite,
    isCloseError,
    registerKnownError,
    type ErrorResolver,
} from './errors';
export type { MessageHandlerFunc, Events, Namespaces, ConnHandler } from './handlers';
export type { Headers } from './url';
export type { WebSocketLike, WebSocketConstructor } from './ws';
export {
    isSystemEvent,
    OnNamespaceConnect,
    OnNamespaceConnected,
    OnNamespaceDisconnect,
    OnRoomJoin,
    OnRoomJoined,
    OnRoomLeave,
    OnRoomLeft,
    OnAnyEvent,
    OnNativeMessage,
    URLParamAsHeaderPrefix,
} from './protocol';
