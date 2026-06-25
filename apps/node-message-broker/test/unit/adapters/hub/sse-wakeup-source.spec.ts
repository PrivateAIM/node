/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MessagePendingEvent } from '@privateaim/messenger-kit';
import { WakeupEventName } from '@privateaim/messenger-kit';
import { describe, expect, it } from 'vitest';
import { SseWakeupSource, parseSseStream } from '../../../../src/adapters/hub/index.ts';

async function* chunksOf(parts: string[]): AsyncGenerator<Uint8Array> {
    const encoder = new TextEncoder();
    for (const part of parts) {
        yield encoder.encode(part);
    }
}

/** Stream that emits `parts` then closes. */
function streamFrom(parts: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller) {
            for (const part of parts) {
                controller.enqueue(encoder.encode(part));
            }
            controller.close();
        },
    });
}

/** Stream that emits `parts` then stays open until `signal` aborts. */
function openStream(parts: string[], signal?: AbortSignal | null): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller) {
            for (const part of parts) {
                controller.enqueue(encoder.encode(part));
            }
            const abort = () => {
                try {
                    controller.error(new Error('aborted'));
                } catch {
                    // stream already closed/errored
                }
            };
            if (signal) {
                if (signal.aborted) {
                    abort();
                } else {
                    signal.addEventListener('abort', abort, { once: true });
                }
            }
        },
    });
}

function pendingEvent(recipient: { type: string, id: string }): string {
    return `event: ${WakeupEventName.MESSAGE_PENDING}\ndata: ${JSON.stringify({ recipient })}\n\n`;
}

describe('adapters/hub/parseSseStream', () => {
    it('parses events split across chunk boundaries, joins data, skips comments', async () => {
        const events = [];
        for await (const event of parseSseStream(chunksOf([
            'event: messagePen',
            'ding\ndata: {"recipient"',
            ':{"type":"client","id":"n1"}}\n\n',
            ': heartbeat-comment\n\n',
            'event: ping\ndata: 1\n\n',
        ]))) {
            events.push(event);
        }

        expect(events).toEqual([
            { event: 'messagePending', data: '{"recipient":{"type":"client","id":"n1"}}' },
            { event: 'ping', data: '1' },
        ]);
    });

    it('parses CRLF-delimited streams', async () => {
        const events = [];
        for await (const event of parseSseStream(chunksOf([
            'event: messagePending\r\ndata: {"recipient":{"type":"client","id":"n1"}}\r\n\r\n',
        ]))) {
            events.push(event);
        }

        expect(events).toEqual([
            { event: 'messagePending', data: '{"recipient":{"type":"client","id":"n1"}}' },
        ]);
    });

    it('handles a CRLF that straddles a chunk boundary', async () => {
        const events = [];
        for await (const event of parseSseStream(chunksOf([
            'data: a\r',
            '\ndata: b\r\n\r\n',
        ]))) {
            events.push(event);
        }

        expect(events).toEqual([{ event: 'message', data: 'a\nb' }]);
    });
});

describe('adapters/hub/SseWakeupSource', () => {
    const recipient = { type: 'client', id: 'node-1' };
    const url = 'http://hub.test/messages/stream';
    const authorization = async () => 'Bearer test-token';

    it('dispatches messagePending events and ignores heartbeats', async () => {
        const received: MessagePendingEvent[] = [];
        let signal: () => void = () => {};
        const fired = new Promise<void>((resolve) => {
            signal = resolve;
        });

        const fetchFn: typeof fetch = async () => new Response(
            streamFrom([
                'event: ping\ndata: 1\n\n',
                pendingEvent(recipient),
            ]),
            { status: 200, headers: { 'content-type': 'text/event-stream' } },
        );

        const source = new SseWakeupSource({
            url,
            authorization,
            fetchFn,
            reconnectDelayMs: 60_000,
            idleTimeoutMs: 0,
        });

        source.subscribe((event) => {
            received.push(event);
            signal();
        });

        await source.start();
        await fired;
        await source.stop();

        expect(received).toEqual([{ recipient }]);
    });

    it('ignores malformed JSON and recipients missing type/id', async () => {
        const received: MessagePendingEvent[] = [];
        let signal: () => void = () => {};
        const fired = new Promise<void>((resolve) => {
            signal = resolve;
        });

        const fetchFn: typeof fetch = async () => new Response(
            streamFrom([
                `event: ${WakeupEventName.MESSAGE_PENDING}\ndata: not-json\n\n`,
                `event: ${WakeupEventName.MESSAGE_PENDING}\ndata: ${JSON.stringify({ recipient: { id: 'x' } })}\n\n`,
                pendingEvent(recipient),
            ]),
            { status: 200, headers: { 'content-type': 'text/event-stream' } },
        );

        const source = new SseWakeupSource({
            url,
            authorization,
            fetchFn,
            reconnectDelayMs: 60_000,
            idleTimeoutMs: 0,
        });

        source.subscribe((event) => {
            received.push(event);
            signal();
        });

        await source.start();
        await fired;
        await source.stop();

        expect(received).toEqual([{ recipient }]);
    });

    it('reconnects after a failed connection and then dispatches', async () => {
        const received: MessagePendingEvent[] = [];
        let signal: () => void = () => {};
        const fired = new Promise<void>((resolve) => {
            signal = resolve;
        });

        let calls = 0;
        const fetchFn: typeof fetch = async (_input, init) => {
            calls += 1;
            if (calls === 1) {
                return new Response(streamFrom([]), { status: 503 });
            }
            return new Response(
                openStream([pendingEvent(recipient)], init?.signal),
                { status: 200, headers: { 'content-type': 'text/event-stream' } },
            );
        };

        const source = new SseWakeupSource({
            url,
            authorization,
            fetchFn,
            reconnectDelayMs: 5,
            idleTimeoutMs: 0,
        });

        source.subscribe((event) => {
            received.push(event);
            signal();
        });

        await source.start();
        await fired;
        await source.stop();

        expect(calls).toBeGreaterThanOrEqual(2);
        expect(received).toEqual([{ recipient }]);
    });

    it('drops a silent connection via the idle watchdog and reconnects', async () => {
        const received: MessagePendingEvent[] = [];
        let signal: () => void = () => {};
        const fired = new Promise<void>((resolve) => {
            signal = resolve;
        });

        let calls = 0;
        const fetchFn: typeof fetch = async (_input, init) => {
            calls += 1;
            if (calls === 1) {
                // open but silent — only the idle watchdog can end it
                return new Response(
                    openStream([], init?.signal),
                    { status: 200, headers: { 'content-type': 'text/event-stream' } },
                );
            }
            return new Response(
                openStream([pendingEvent(recipient)], init?.signal),
                { status: 200, headers: { 'content-type': 'text/event-stream' } },
            );
        };

        const source = new SseWakeupSource({
            url,
            authorization,
            fetchFn,
            reconnectDelayMs: 5,
            idleTimeoutMs: 15,
        });

        source.subscribe((event) => {
            received.push(event);
            signal();
        });

        await source.start();
        await fired;
        await source.stop();

        expect(calls).toBeGreaterThanOrEqual(2);
        expect(received).toEqual([{ recipient }]);
    });

    it('stops promptly while a connection is open', async () => {
        let calls = 0;
        const fetchFn: typeof fetch = async (_input, init) => {
            calls += 1;
            return new Response(
                openStream([], init?.signal),
                { status: 200, headers: { 'content-type': 'text/event-stream' } },
            );
        };

        const source = new SseWakeupSource({
            url,
            authorization,
            fetchFn,
            reconnectDelayMs: 60_000,
            idleTimeoutMs: 0,
        });

        await source.start();
        // let the loop open the connection before tearing it down
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 5);
        });
        await source.stop();

        expect(calls).toBe(1);
    });

    it('stops cleanly without ever connecting', async () => {
        let calls = 0;
        const fetchFn: typeof fetch = async () => {
            calls += 1;
            return new Response(streamFrom([]), { status: 200 });
        };

        const source = new SseWakeupSource({
            url,
            authorization,
            fetchFn,
            reconnectDelayMs: 60_000,
        });

        await source.stop();

        expect(calls).toBe(0);
    });
});
