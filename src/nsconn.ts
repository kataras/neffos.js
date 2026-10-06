import type { AskOptions, Conn } from './conn';
import { ErrBadRoom } from './errors';
import { fireEvent, type Events } from './handlers';
import { Message, copyMessage, type WSData } from './message';
import {
    OnNamespaceDisconnect,
    OnRoomJoin,
    OnRoomJoined,
    OnRoomLeave,
    OnRoomLeft,
} from './protocol';
import { Room } from './room';

/* The NSConn describes a connected connection to a specific namespace,
   it emits with the `Message.Namespace` filled and it can join to multiple rooms.
   A single Conn can be connected to one or more namespaces,
   each connected namespace is described by this class. */
export class NSConn {
    /* The conn property refers to the main `Conn` constructed by the `dial` function. */
    conn: Conn;
    namespace: string;
    events: Events;
    /* The rooms property is the map of the connected namespace's joined rooms. */
    rooms: Map<string, Room>;

    constructor(conn: Conn, namespace: string, events: Events) {
        this.conn = conn;
        this.namespace = namespace;
        this.events = events;
        this.rooms = new Map<string, Room>();
    }

    private message(event: string, body: WSData = ""): Message {
        const msg = new Message();
        msg.Namespace = this.namespace;
        msg.Event = event;
        msg.Body = body;
        // Bytes travel as a binary frame; a text frame would mangle bytes that are not UTF-8.
        msg.SetBinary = typeof body !== 'string';
        return msg;
    }

    /** emit sends a message to the server with `Message.Namespace` set to this namespace. */
    emit(event: string, body: WSData): boolean {
        return this.conn.write(this.message(event, body));
    }

    /** emitBinary acts like emit but sets `Message.SetBinary` to true. A string body is sent as its UTF-8 bytes. */
    emitBinary(event: string, body: WSData): boolean {
        const msg = this.message(event, body);
        msg.SetBinary = true;
        return this.conn.write(msg);
    }

    /** ask sends a message and resolves with the server's reply. See `Conn.ask` for the options. */
    ask(event: string, body: WSData, options?: AskOptions): Promise<Message> {
        return this.conn.ask(this.message(event, body), options);
    }

    /**
     * joinRoom asks the server to join the given room and resolves with the
     * `Room` instance. Rejects if the server denies the join.
     */
    async joinRoom(roomName: string): Promise<Room> {
        return await this.askRoomJoin(roomName);
    }

    /** room returns an already-joined Room or undefined. */
    room(roomName: string): Room | undefined {
        return this.rooms.get(roomName);
    }

    /** roomNames returns the names of the joined rooms. */
    roomNames(): string[] {
        return [...this.rooms.keys()];
    }

    /**
     * leaveAll concurrently leaves every joined room. Resolves when every room is
     * left; otherwise rejects with the first error, after every leave has settled
     * so the local state is consistent.
     */
    async leaveAll(): Promise<void> {
        const results = await Promise.allSettled(this.roomNames().map((roomName) => {
            const msg = this.message(OnRoomLeave);
            msg.Room = roomName;
            msg.IsLocal = true;
            return this.askRoomLeave(msg);
        }));

        for (const result of results) {
            if (result.status === 'rejected') {
                throw result.reason;
            }
        }
    }

    /** forceLeaveAll forgets every joined room and fires forced leave and left events for each. */
    forceLeaveAll(isLocal: boolean): void {
        for (const roomName of this.roomNames()) {
            const leaveMsg = this.message(OnRoomLeave);
            leaveMsg.Room = roomName;
            leaveMsg.IsForced = true;
            leaveMsg.IsLocal = isLocal;
            void fireEvent(this, leaveMsg);

            this.rooms.delete(roomName);

            void fireEvent(this, copyMessage(leaveMsg, { Event: OnRoomLeft }));
        }
    }

    /**
     * disconnect sends a disconnect signal to the server and fires the local
     * `OnNamespaceDisconnect` event. Rejects with the server or handler error.
     */
    disconnect(): Promise<void> {
        return this.conn.askDisconnect(this.message(OnNamespaceDisconnect));
    }

    async askRoomJoin(roomName: string): Promise<Room> {
        let room = this.rooms.get(roomName);
        if (room !== undefined) {
            return room;
        }

        const joinMsg = this.message(OnRoomJoin);
        joinMsg.Room = roomName;
        joinMsg.IsLocal = true;

        await this.conn.ask(joinMsg);

        const err = await fireEvent(this, joinMsg);
        if (err !== undefined) {
            throw err;
        }

        room = new Room(this, roomName);
        this.rooms.set(roomName, room);

        await fireEvent(this, copyMessage(joinMsg, { Event: OnRoomJoined }));
        return room;
    }

    async askRoomLeave(msg: Message): Promise<void> {
        if (!this.rooms.has(msg.Room)) {
            throw ErrBadRoom;
        }

        await this.conn.ask(msg);

        const err = await fireEvent(this, msg);
        if (err !== undefined) {
            throw err;
        }

        this.rooms.delete(msg.Room);

        await fireEvent(this, copyMessage(msg, { Event: OnRoomLeft }));
    }

    async replyRoomJoin(msg: Message): Promise<void> {
        if (msg.wait === "" || msg.isNoOp) {
            return;
        }

        if (!this.rooms.has(msg.Room)) {
            const err = await fireEvent(this, msg);
            if (err !== undefined) {
                this.conn.write(copyMessage(msg, { Err: err }));
                return;
            }

            this.rooms.set(msg.Room, new Room(this, msg.Room));

            await fireEvent(this, copyMessage(msg, { Event: OnRoomJoined }));
        }

        this.conn.writeEmptyReply(msg.wait);
    }

    async replyRoomLeave(msg: Message): Promise<void> {
        if (msg.wait === "" || msg.isNoOp) {
            return;
        }

        if (!this.rooms.has(msg.Room)) {
            this.conn.writeEmptyReply(msg.wait);
            return;
        }

        await fireEvent(this, msg);

        this.rooms.delete(msg.Room);
        this.conn.writeEmptyReply(msg.wait);

        await fireEvent(this, copyMessage(msg, { Event: OnRoomLeft }));
    }
}
