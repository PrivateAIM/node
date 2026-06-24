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
});

describe('adapters/hub/SseWakeupSource', () => {
    const recipient = { type: 'client', id: 'node-1' };

    it('dispatches messagePending events and ignores heartbeats', async () => {
        const received: MessagePendingEvent[] = [];
        let signal: () => void = () => {};
        const fired = new Promise<void>((resolve) => {
            signal = resolve;
        });

        const fetchFn: typeof fetch = async () => new Response(
            streamFrom([
                'event: ping\ndata: 1\n\n',
                `event: ${WakeupEventName.MESSAGE_PENDING}\ndata: ${JSON.stringify({ recipient })}\n\n`,
            ]),
            { status: 200, headers: { 'content-type': 'text/event-stream' } },
        );

        const source = new SseWakeupSource({
            url: 'http://hub.test/messages/stream',
            authorization: async () => 'Bearer test-token',
            fetchFn,
            reconnectDelayMs: 60_000,
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

    it('stops cleanly without ever connecting', async () => {
        let calls = 0;
        const fetchFn: typeof fetch = async () => {
            calls += 1;
            return new Response(streamFrom([]), { status: 200 });
        };

        const source = new SseWakeupSource({
            url: 'http://hub.test/messages/stream',
            authorization: async () => 'Bearer test-token',
            fetchFn,
            reconnectDelayMs: 60_000,
        });

        await source.stop();

        expect(calls).toBe(0);
    });
});
