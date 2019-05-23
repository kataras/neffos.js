export declare type WSData = string;
export declare const OnNamespaceConnect = "_OnNamespaceConnect";
export declare const OnNamespaceConnected = "_OnNamespaceConnected";
export declare const OnNamespaceDisconnect = "_OnNamespaceDisconnect";
export declare const OnRoomJoin = "_OnRoomJoin";
export declare const OnRoomJoined = "_OnRoomJoined";
export declare const OnRoomLeave = "_OnRoomLeave";
export declare const OnRoomLeft = "_OnRoomLeft";
export declare const OnAnyEvent = "_OnAnyEvent";
export declare const OnNativeMessage = "_OnNativeMessage";
export declare function isSystemEvent(event: string): boolean;
export declare class Message {
    Namespace: string;
    Room: string;
    Event: string;
    Body: WSData;
    Err: string;
    IsForced: boolean;
    IsLocal: boolean;
    IsNative: boolean;
}
export declare class Room {
    nsConn: NSConn;
    name: string;
    constructor(ns: NSConn, roomName: string);
    emit(event: string, body: WSData): boolean;
    leave(): Promise<Error>;
}
export declare class NSConn {
    conn: Conn;
    namespace: string;
    events: Events;
    rooms: Map<string, Room>;
    constructor(conn: Conn, namespace: string, events: Events);
    emit(event: string, body: WSData): boolean;
    ask(event: string, body: WSData): Promise<Message | Error>;
    joinRoom(roomName: string): Promise<Room | Error>;
    room(roomName: string): Room;
    leaveAll(): Promise<Error>;
    disconnect(): Promise<Error>;
}
export declare type MessageHandlerFunc = (c: NSConn, msg: Message) => Error;
export interface Events {
    [key: string]: MessageHandlerFunc;
}
export interface Namespaces {
    [key: string]: Events;
}
export declare const ErrInvalidPayload: Error;
export declare const ErrBadNamespace: Error;
export declare const ErrBadRoom: Error;
export declare const ErrClosed: Error;
export declare const ErrWrite: Error;
export declare function dial(endpoint: string, connHandler: Namespaces, protocols?: string[]): Promise<Conn>;
export declare class Conn {
    ID: string;
    constructor(conn: WebSocket, connHandler: Namespaces, protocols?: string[]);
    connect(namespace: string): Promise<NSConn | Error>;
    namespace(namespace: string): NSConn;
    ask(msg: Message): Promise<Message | Error>;
    isClosed(): boolean;
    write(msg: Message): boolean;
    close(): void;
}
