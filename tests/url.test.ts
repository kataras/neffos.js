import { afterEach, describe, expect, test, vi } from 'vitest';
import { appendHeadersAsURLParams, normalizeEndpoint, toHTTPEndpoint } from '../src/url';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('normalizeEndpoint', () => {
    test.each([
        ['ws://localhost:8080/echo', 'ws://localhost:8080/echo'],
        ['wss://example.com/echo?x=1#h', 'wss://example.com/echo?x=1#h'],
        ['http://localhost:8080/echo', 'ws://localhost:8080/echo'],
        ['https://example.com/echo', 'wss://example.com/echo'],
        ['HTTP://Example.com/echo', 'ws://example.com/echo'],
        ['localhost:8080/echo', 'ws://localhost:8080/echo'],
        ['neffos.test/echo', 'ws://neffos.test/echo'],
        // 0.2.0 only checked for "ws" anywhere in the string, so these kept no scheme.
        ['news.example.com/feed', 'ws://news.example.com/feed'],
        ['example.com/ws', 'ws://example.com/ws'],
        ['  ws://padded.test/echo  ', 'ws://padded.test/echo'],
    ])('%j becomes %j', (input, expected) => {
        expect(normalizeEndpoint(input)).toBe(expected);
    });

    test('http:// no longer turns into ws://http://', () => {
        expect(normalizeEndpoint('http://x')).toBe('ws://x/');
    });

    test('a path starting with "/" resolves against the page location', () => {
        vi.stubGlobal('location', { href: 'https://app.example.com:8443/chat/index.html' });
        expect(normalizeEndpoint('/echo?room=1')).toBe('wss://app.example.com:8443/echo?room=1');

        vi.stubGlobal('location', { href: 'http://localhost:3000/' });
        expect(normalizeEndpoint('/echo')).toBe('ws://localhost:3000/echo');
    });

    test('a protocol-relative endpoint takes the page scheme', () => {
        vi.stubGlobal('location', { href: 'https://app.example.com/' });
        expect(normalizeEndpoint('//other.example.com/echo')).toBe('wss://other.example.com/echo');
    });

    test('a path starting with "/" throws a TypeError without a page location', () => {
        vi.stubGlobal('location', undefined);
        expect(() => normalizeEndpoint('/echo')).toThrow(TypeError);
    });

    test('an unsupported scheme throws a TypeError', () => {
        expect(() => normalizeEndpoint('ftp://example.com/echo')).toThrow(TypeError);
    });
});

describe('appendHeadersAsURLParams', () => {
    test('adds each header as an X-Websocket-Header- parameter', () => {
        expect(appendHeadersAsURLParams({ Authorization: 'Bearer a b', 'X-Num': 3 }, 'ws://h/echo')).toBe(
            'ws://h/echo?X-Websocket-Header-Authorization=Bearer+a+b&X-Websocket-Header-X-Num=3',
        );
    });

    test('keeps the existing query and hash', () => {
        expect(appendHeadersAsURLParams({ A: '1' }, 'ws://h/echo?x=1#frag')).toBe('ws://h/echo?x=1&X-Websocket-Header-A=1#frag');
    });

    test('encodes reserved characters so the server reads them back as sent', () => {
        const url = appendHeadersAsURLParams({ Token: 'a&b=c;d#e' }, 'ws://h/echo');
        expect(new URL(url).searchParams.get('X-Websocket-Header-Token')).toBe('a&b=c;d#e');
    });

    test('returns the URL unchanged when there are no headers', () => {
        expect(appendHeadersAsURLParams(undefined, 'ws://h/echo?x=1')).toBe('ws://h/echo?x=1');
        expect(appendHeadersAsURLParams({}, 'ws://h/echo?x=1')).toBe('ws://h/echo?x=1');
    });
});

describe('toHTTPEndpoint', () => {
    test.each([
        ['ws://localhost:8080/echo', 'http://localhost:8080/echo'],
        ['wss://example.com/echo?x=1', 'https://example.com/echo?x=1'],
        // 0.2.0 used a regex that also rewrote "ws://" inside the query.
        ['ws://h/echo?next=ws://other', 'http://h/echo?next=ws://other'],
    ])('%j becomes %j', (input, expected) => {
        expect(toHTTPEndpoint(input)).toBe(expected);
    });
});
