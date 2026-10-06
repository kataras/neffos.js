// User event handlers: their types, how the handler map passed to `dial` is read, and how events are fired.

import type { Message } from './message';
import type { NSConn } from './nsconn';
import { OnAnyEvent } from './protocol';

/* The MessageHandlerFunc is the definition type of the events' callback.
   It may be async. A returned (or resolved) `Error` is the event's error: on
   `OnNamespaceConnect` it aborts the connect, on a server event it is written back
   to the server. A thrown error counts the same way. Anything else, including
   `null` and `undefined`, means success. See examples for more. */
export type MessageHandlerFunc = (c: NSConn, msg: Message) =>
    void | Error | null | Promise<void | Error | null>;

export type Events = Map<string, MessageHandlerFunc>;
export type Namespaces = Map<string, Events>;

/**
 * ConnHandler is the handler map passed to `dial`. Either every key is a namespace
 * (`{ namespace: { event: handler } }`, or a `Map` of events), or every key is an
 * event of the empty namespace (`{ event: handler }`). Mixing both is an error.
 */
export type ConnHandler = Record<string, MessageHandlerFunc | Events | Record<string, MessageHandlerFunc>>;

/**
 * fireEvent calls the handler for `msg.Event` (or `OnAnyEvent`) and resolves with its
 * error, if any. The handler runs synchronously up to its first `await`. Only `Error`
 * instances count as errors; a thrown non-Error value is wrapped in one.
 */
export async function fireEvent(ns: NSConn, msg: Message): Promise<Error | undefined> {
    const handler = ns.events.get(msg.Event) ?? ns.events.get(OnAnyEvent);
    if (handler === undefined) {
        return undefined;
    }

    try {
        const result = await handler(ns, msg);
        return result instanceof Error ? result : undefined;
    } catch (err) {
        return err instanceof Error ? err : new Error(String(err));
    }
}

/**
 * resolveNamespaces turns the handler map passed to `dial` into namespaces of events.
 * Throws a `TypeError` when the map is missing or mixes namespaces and events.
 */
export function resolveNamespaces(obj: unknown): Namespaces {
    if (obj === null || typeof obj !== 'object') {
        throw new TypeError("connHandler is empty.");
    }

    const namespaces: Namespaces = new Map();
    const events: Events = new Map();

    const entries = Object.entries(obj as Record<string, unknown>);
    for (const [key, value] of entries) {
        if (typeof value === 'function') {
            events.set(key, value as MessageHandlerFunc);
        } else if (value instanceof Map) {
            namespaces.set(key, value as Events);
        } else if (value !== null && typeof value === 'object') {
            // A plain object of events.
            const objEvents: Events = new Map();
            for (const [event, handler] of Object.entries(value as Record<string, unknown>)) {
                if (typeof handler !== 'function') {
                    throw new TypeError(`the handler of event "${event}" in namespace "${key}" is not a function`);
                }
                objEvents.set(event, handler as MessageHandlerFunc);
            }
            namespaces.set(key, objEvents);
        } else {
            throw new TypeError(`connHandler["${key}"] must be an event handler or a namespace of handlers`);
        }
    }

    if (events.size > 0) {
        if (entries.length !== events.size) {
            throw new TypeError("all keys of connHandler should be events, mix of namespaces and event callbacks is not supported " + events.size + " vs total " + entries.length);
        }
        namespaces.set("", events);
    }

    return namespaces;
}

export function getEvents(namespaces: Namespaces, namespace: string): Events | undefined {
    return namespaces.get(namespace);
}
