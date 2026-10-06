import { Message, type WSData } from './message';
import type { NSConn } from './nsconn';
import { OnRoomLeave } from './protocol';

/* The Room describes a connected connection to a room,
   emits messages with the `Message.Room` filled to the specific room
   and `Message.Namespace` to the underline `NSConn`'s namespace. */
export class Room {
    nsConn: NSConn;
    name: string;

    constructor(ns: NSConn, roomName: string) {
        this.nsConn = ns;
        this.name = roomName;
    }

    private message(event: string, body: WSData = ""): Message {
        const msg = new Message();
        msg.Namespace = this.nsConn.namespace;
        msg.Room = this.name;
        msg.Event = event;
        msg.Body = body;
        // Bytes travel as a binary frame; a text frame would mangle bytes that are not UTF-8.
        msg.SetBinary = typeof body !== 'string';
        return msg;
    }

    /**
     * emit sends a message to the server with `Message.Room` set to this room
     * and `Message.Namespace` set to the underlying NSConn's namespace.
     * Returns true on success, false if the connection is closed or the
     * message is not allowed.
     */
    emit(event: string, body: WSData): boolean {
        return this.nsConn.conn.write(this.message(event, body));
    }

    /**
     * emitBinary acts like `emit` but sets `Message.SetBinary` to true so the
     * message is sent as a binary frame. A string body is sent as its UTF-8 bytes.
     */
    emitBinary(event: string, body: WSData): boolean {
        const msg = this.message(event, body);
        msg.SetBinary = true;
        return this.nsConn.conn.write(msg);
    }

    /**
     * leave sends a local and remote room-leave signal (`OnRoomLeave`). On
     * success the local `OnRoomLeft` event is fired. Rejects with `ErrBadRoom`
     * if the room is not joined, or with the server or handler error.
     */
    leave(): Promise<void> {
        return this.nsConn.askRoomLeave(this.message(OnRoomLeave));
    }
}
