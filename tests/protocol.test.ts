import { describe, expect, test } from 'vitest';
import { Message } from '../src/message';
import {
    OnAnyEvent,
    OnNamespaceConnect,
    OnNamespaceConnected,
    OnNamespaceDisconnect,
    OnNativeMessage,
    OnRoomJoin,
    OnRoomJoined,
    OnRoomLeave,
    OnRoomLeft,
    escapeMessageField,
    genEmptyReplyToWait,
    isSystemEvent,
    splitN,
    unescapeMessageField,
} from '../src/protocol';
import { createWaitGenerator, genWait } from '../src/serialize';
import { emptyReplyVector, fieldSeparatorReplacement } from './golden/messages';

describe('event names', () => {
    test('match the Go constants', () => {
        expect({
            OnNamespaceConnect,
            OnNamespaceConnected,
            OnNamespaceDisconnect,
            OnRoomJoin,
            OnRoomJoined,
            OnRoomLeave,
            OnRoomLeft,
            OnAnyEvent,
            OnNativeMessage,
        }).toEqual({
            OnNamespaceConnect: '_OnNamespaceConnect',
            OnNamespaceConnected: '_OnNamespaceConnected',
            OnNamespaceDisconnect: '_OnNamespaceDisconnect',
            OnRoomJoin: '_OnRoomJoin',
            OnRoomJoined: '_OnRoomJoined',
            OnRoomLeave: '_OnRoomLeave',
            OnRoomLeft: '_OnRoomLeft',
            OnAnyEvent: '_OnAnyEvent',
            OnNativeMessage: '_OnNativeMessage',
        });
    });

    test.each([
        OnNamespaceConnect,
        OnNamespaceConnected,
        OnNamespaceDisconnect,
        OnRoomJoin,
        OnRoomJoined,
        OnRoomLeave,
        OnRoomLeft,
    ])('isSystemEvent(%s) is true', (event) => {
        expect(isSystemEvent(event)).toBe(true);
    });

    test.each([OnAnyEvent, OnNativeMessage, 'chat', ''])('isSystemEvent(%j) is false', (event) => {
        expect(isSystemEvent(event)).toBe(false);
    });
});

describe('field escaping', () => {
    test('replaces every separator with the Go replacement string', () => {
        expect(escapeMessageField(';a;b;')).toBe(
            `${fieldSeparatorReplacement}a${fieldSeparatorReplacement}b${fieldSeparatorReplacement}`,
        );
    });

    test('unescape reverses escape', () => {
        const values = ['plain', ';', 'a;b', ';;', 'contains;semi', ';this;for sure;'];
        for (const value of values) {
            expect(unescapeMessageField(escapeMessageField(value))).toBe(value);
        }
    });

    test('empty and missing values become the empty string', () => {
        expect(escapeMessageField('')).toBe('');
        expect(escapeMessageField(undefined as unknown as string)).toBe('');
        expect(unescapeMessageField('')).toBe('');
        expect(unescapeMessageField(undefined as unknown as string)).toBe('');
    });
});

describe('splitN', () => {
    test('splits `limit` times and keeps the rest, separators included', () => {
        expect(splitN('a;b;c;d', ';', 2)).toEqual(['a', 'b', 'c;d']);
        expect(splitN(';default;;chat;0;0;x;y', ';', 6)).toEqual(['', 'default', '', 'chat', '0', '0', 'x;y']);
    });

    test('returns the input whole when it has fewer than `limit` separators', () => {
        expect(splitN('a;b', ';', 4)).toEqual(['a;b']);
        // Exactly `limit - 1` separators: Go's SplitN gives one field too few, so this
        // must not return `limit + 1` elements either.
        expect(splitN('a;b;c', ';', 3)).toEqual(['a;b;c']);
        expect(splitN(';default;;chat;0;0', ';', 6)).toEqual([';default;;chat;0;0']);
    });

    test('a trailing separator gives an empty last element', () => {
        expect(splitN('a;b;', ';', 2)).toEqual(['a', 'b', '']);
    });

    test('limit 0 returns the input whole', () => {
        expect(splitN('a;b', ';', 0)).toEqual(['a;b']);
    });
});

describe('waits', () => {
    test('the empty reply to a wait is the wait followed by six separators', () => {
        expect(genEmptyReplyToWait(emptyReplyVector.wait)).toBe(emptyReplyVector.wire);
    });

    test('client waits start with "$" and are unique', () => {
        const waits = new Set<string>();
        for (let i = 0; i < 1000; i++) {
            const wait = genWait();
            expect(wait).toMatch(/^\$[0-9a-z]+$/);
            waits.add(wait);
        }
        expect(waits.size).toBe(1000);
    });

    test('waits from different generators do not collide', () => {
        const a = createWaitGenerator();
        const b = createWaitGenerator();
        const waits = new Set<string>();
        for (let i = 0; i < 100; i++) {
            waits.add(a());
            waits.add(b());
        }
        expect(waits.size).toBe(200);
    });

    test('the second character of a wait is never "!", the Go stack-exchange marker', () => {
        for (let i = 0; i < 200; i++) {
            expect(createWaitGenerator()()[1]).not.toBe('!');
        }
    });

    test.each([
        ['$123', true],
        ['#123', true],
        // Any non-empty wait counts, as in Go's Message.IsWait on the client side.
        ['123', true],
        ['', false],
    ])('Message with wait %j: isWait() is %s', (wait, expected) => {
        const msg = new Message();
        msg.wait = wait;
        expect(msg.isWait()).toBe(expected);
    });
});
