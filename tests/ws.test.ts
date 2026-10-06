import { afterEach, describe, expect, expectTypeOf, test, vi } from 'vitest';
import { WebSocket as WsPackageWebSocket } from 'ws';
import { NeffosError } from '../src/errors';
import { resolveWebSocket, type WebSocketConstructor } from '../src/ws';
import { FakeWebSocket } from './helpers/fake-ws';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('resolveWebSocket', () => {
    test('Options.WebSocket comes first', async () => {
        const resolved = await resolveWebSocket(FakeWebSocket);
        expect(resolved.WebSocket).toBe(FakeWebSocket);
        expect(resolved.supportsHeaders).toBe(false);
    });

    test('a custom constructor from the ws package sends real headers', async () => {
        const resolved = await resolveWebSocket(WsPackageWebSocket);
        expect(resolved.WebSocket).toBe(WsPackageWebSocket);
        expect(resolved.supportsHeaders).toBe(true);
    });

    test('globalThis.WebSocket comes next', async () => {
        vi.stubGlobal('WebSocket', FakeWebSocket);
        const resolved = await resolveWebSocket();
        expect(resolved.WebSocket).toBe(FakeWebSocket);
        expect(resolved.supportsHeaders).toBe(false);
    });

    test('the ws package is loaded when there is no global WebSocket', async () => {
        vi.stubGlobal('WebSocket', undefined);
        const resolved = await resolveWebSocket();
        expect(resolved.WebSocket).toBe(WsPackageWebSocket);
        expect(resolved.supportsHeaders).toBe(true);
    });

    test('rejects with ERR_NO_WEBSOCKET when ws cannot be loaded either', async () => {
        vi.stubGlobal('WebSocket', undefined);
        vi.doMock('ws', () => {
            throw new Error('Cannot find package ws');
        });
        try {
            vi.resetModules();
            const { resolveWebSocket: fresh } = await import('../src/ws');
            const { NeffosError: FreshNeffosError } = await import('../src/errors');
            const err: unknown = await fresh().catch((e: unknown) => e);
            expect(err).toBeInstanceOf(FreshNeffosError);
            expect((err as NeffosError).code).toBe('ERR_NO_WEBSOCKET');
        } finally {
            vi.doUnmock('ws');
            vi.resetModules();
        }
    });
});

describe('WebSocketConstructor', () => {
    test('accepts the browser WebSocket, the ws package and the test fake', () => {
        expectTypeOf(globalThis.WebSocket).toExtend<WebSocketConstructor>();
        expectTypeOf(WsPackageWebSocket).toExtend<WebSocketConstructor>();
        expectTypeOf(FakeWebSocket).toExtend<WebSocketConstructor>();
    });
});
