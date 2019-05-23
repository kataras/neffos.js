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
export declare function IsSystemEvent(event: string): boolean;
export declare class Message {
    wait: string;
    Namespace: string;
    Room: string;
    Event: string;
    Body: WSData;
    Err: string;
    isError: boolean;
    isNoOp: boolean;
    isInvalid: boolean;
    IsForced: boolean;
    IsLocal: boolean;
    IsNative: boolean;
    isConnect(): boolean;
    isDisconnect(): boolean;
    isRoomJoin(): boolean;
    isRoomLeft(): boolean;
    isWait(): boolean;
}
export declare class Room {
    nsConn: NSConn;
    name: string;
    constructor(ns: NSConn, roomName: string);
    Emit(event: string, body: WSData): boolean;
    Leave(): Promise<Error>;
}
export declare class NSConn {
    conn: Conn;
    namespace: string;
    events: Events;
    rooms: Map<string, Room>;
    constructor(conn: Conn, namespace: string, events: Events);
    Emit(event: string, body: WSData): boolean;
    Ask(event: string, body: WSData): Promise<Message | Error>;
    JoinRoom(roomName: string): Promise<Room | Error>;
    Room(roomName: string): Room;
    Rooms(): Room[];
    LeaveAll(): Promise<Error>;
    forceLeaveAll(isLocal: boolean): void;
    Disconnect(): Promise<Error>;
    askRoomJoin(roomName: string): Promise<Room | Error>;
    askRoomLeave(msg: Message): Promise<Error>;
    replyRoomJoin(msg: Message): void;
    replyRoomLeave(msg: Message): void;
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
export declare function Dial(endpoint: string, connHandler: Namespaces, protocols?: string[]): Promise<Conn>;
export declare class Conn {
    private conn;
    private isAcknowledged;
    private allowNativeMessages;
    ID: string;
    closed: boolean;
    private queue;
    private waitingMessages;
    private namespaces;
    private connectedNamespaces;
    constructor(conn: WebSocket, connHandler: Namespaces, protocols?: string[]);
    IsAcknowledged(): boolean;
    handle(evt: MessageEvent): Error;
    private handleAck;
    private handleQueue;
    private handleMessage;
    Connect(namespace: string): Promise<NSConn | Error>;
    Namespace(namespace: string): NSConn;
    private replyConnect;
    private replyDisconnect;
    Ask(msg: Message): Promise<Message | Error>;
    private askConnect;
    askDisconnect(msg: Message): Promise<Error>;
    IsClosed(): boolean;
    Write(msg: Message): boolean;
    private write;
    writeEmptyReply(wait: string): void;
    Close(): void;
}
