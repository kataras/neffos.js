// Endpoint URL handling for `dial`.

import { URLParamAsHeaderPrefix } from './protocol';

/** Extra request headers for the handshake. Values are sent as strings. */
export interface Headers {
    [key: string]: string | number | boolean;
}

const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i;

function pageLocation(): string | undefined {
    const loc = (globalThis as { location?: { href?: unknown } }).location;
    return typeof loc?.href === 'string' ? loc.href : undefined;
}

/**
 * normalizeEndpoint turns the endpoint passed to `dial` into an absolute ws:// or
 * wss:// URL. http becomes ws and https becomes wss. An endpoint with no scheme gets
 * "ws://". A path starting with "/" is resolved against `globalThis.location` (the
 * current page) and throws a `TypeError` where there is none. Any other scheme throws
 * a `TypeError` too.
 */
export function normalizeEndpoint(endpoint: string): string {
    const input = endpoint.trim();
    let url: URL;

    if (input.startsWith("/")) {
        const base = pageLocation();
        if (base === undefined) {
            if (input.startsWith("//")) {
                url = new URL("ws:" + input);
            } else {
                throw new TypeError(`cannot resolve the relative endpoint "${endpoint}": there is no page location to resolve it against`);
            }
        } else {
            url = new URL(input, base);
        }
    } else if (hasScheme.test(input)) {
        url = new URL(input);
    } else {
        url = new URL("ws://" + input);
    }

    switch (url.protocol) {
        case "ws:":
        case "wss:":
            break;
        case "http:":
            url.protocol = "ws:";
            break;
        case "https:":
            url.protocol = "wss:";
            break;
        default:
            throw new TypeError(`unsupported endpoint scheme "${url.protocol}" in "${endpoint}"`);
    }

    return url.href;
}

/**
 * appendHeadersAsURLParams adds each header to `url` as a `X-Websocket-Header-<name>`
 * query parameter, which the Go server reads back as a request header. The existing
 * query and hash are kept.
 */
export function appendHeadersAsURLParams(headers: Headers | undefined, url: string): string {
    if (headers === undefined) {
        return url;
    }

    const keys = Object.keys(headers);
    if (keys.length === 0) {
        return url;
    }

    const u = new URL(url);
    for (const key of keys) {
        u.searchParams.append(URLParamAsHeaderPrefix + key, String(headers[key]));
    }
    return u.href;
}

/** toHTTPEndpoint turns a ws:// or wss:// endpoint into its http:// or https:// form. */
export function toHTTPEndpoint(endpoint: string): string {
    const url = new URL(endpoint);
    if (url.protocol === "ws:") {
        url.protocol = "http:";
    } else if (url.protocol === "wss:") {
        url.protocol = "https:";
    }
    return url.href;
}
