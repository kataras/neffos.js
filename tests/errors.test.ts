import { describe, expect, test } from 'vitest';
import {
    CloseError,
    ErrBadNamespace,
    ErrBadRoom,
    ErrClosed,
    ErrInvalidPayload,
    ErrWrite,
    NeffosError,
    isCloseError,
    registerKnownError,
    resolveError,
} from '../src/errors';
import * as publicApi from '../src/index';

describe('shared error values', () => {
    test.each([
        ['ErrInvalidPayload', ErrInvalidPayload, 'invalid payload', 'ERR_INVALID_PAYLOAD'],
        ['ErrBadNamespace', ErrBadNamespace, 'bad namespace', 'ERR_BAD_NAMESPACE'],
        ['ErrBadRoom', ErrBadRoom, 'bad room', 'ERR_BAD_ROOM'],
        ['ErrClosed', ErrClosed, 'use of closed connection', 'ERR_CLOSED'],
        ['ErrWrite', ErrWrite, 'write closed', 'ERR_WRITE'],
    ])('%s keeps the Go error text and has a code', (_name, err, message, code) => {
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(NeffosError);
        expect(err.message).toBe(message);
        expect(err.code).toBe(code);
    });

    test('the public exports are the same instances', () => {
        expect(publicApi.ErrBadNamespace).toBe(ErrBadNamespace);
        expect(publicApi.ErrClosed).toBe(ErrClosed);
        expect(publicApi.NeffosError).toBe(NeffosError);
        expect(publicApi.CloseError).toBe(CloseError);
    });
});

describe('resolveError', () => {
    test.each([
        ['bad namespace', ErrBadNamespace],
        ['bad room', ErrBadRoom],
        ['write closed', ErrWrite],
        ['invalid payload', ErrInvalidPayload],
    ])('%j resolves to the shared instance', (text, err) => {
        expect(resolveError(text)).toBe(err);
    });

    test('unknown text gives a plain Error with that text', () => {
        const err = resolveError('something else');
        expect(err).toBeInstanceOf(Error);
        expect(err).not.toBeInstanceOf(NeffosError);
        expect(err.message).toBe('something else');
    });

    test('"[code] text" gives a CloseError whose cause is the resolved text', () => {
        const err = resolveError('[-1] write closed');
        expect(err).toBeInstanceOf(CloseError);
        const closeErr = err as CloseError;
        expect(closeErr.closeCode).toBe(-1);
        expect(closeErr.cause).toBe(ErrWrite);
        expect(closeErr.message).toBe('[-1] write closed');
        expect(closeErr.code).toBe('ERR_CLOSE');
    });

    test('"[code] text" with unknown text keeps the text in the cause', () => {
        const err = resolveError('[4001] kicked; bye') as CloseError;
        expect(err.closeCode).toBe(4001);
        expect(err.cause.message).toBe('kicked; bye');
        expect(err.message).toBe('[4001] kicked; bye');
    });

    test('text that only looks like a close code is left alone', () => {
        expect(resolveError('[abc] nope')).not.toBeInstanceOf(CloseError);
        expect(resolveError('[1]nope')).not.toBeInstanceOf(CloseError);
    });
});

describe('registerKnownError', () => {
    test('a registered error resolves by its message', () => {
        const ErrQuota = new Error('quota exceeded (t13 test)');
        registerKnownError(ErrQuota);
        registerKnownError(ErrQuota); // registering twice is harmless
        expect(resolveError('quota exceeded (t13 test)')).toBe(ErrQuota);
    });

    test('a registered error can match text through its own resolveError', () => {
        const ErrRateLimited = Object.assign(new Error('rate limited'), {
            resolveError: (text: string) => text.startsWith('rate limited:'),
        });
        registerKnownError(ErrRateLimited);
        expect(resolveError('rate limited: retry in 3s')).toBe(ErrRateLimited);
        expect(resolveError('rate limited')).toBe(ErrRateLimited);
    });
});

describe('isCloseError', () => {
    test('is true for a CloseError and for the legacy "[-1] write closed" text', () => {
        expect(isCloseError(new CloseError(1001, new Error('going away')))).toBe(true);
        expect(isCloseError(new Error('[-1] write closed'))).toBe(true);
    });

    test('is false for anything else', () => {
        expect(isCloseError(ErrWrite)).toBe(false);
        expect(isCloseError(new Error('bad namespace'))).toBe(false);
        expect(isCloseError(undefined)).toBe(false);
        expect(isCloseError('[-1] write closed')).toBe(false);
    });
});
