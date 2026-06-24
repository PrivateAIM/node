/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MessagePendingEvent } from '@privateaim/messenger-kit';
import { WakeupEventName } from '@privateaim/messenger-kit';
import type { Logger } from '@privateaim/server-kit';
import type { IWakeupSource } from '../../core/hub/index.ts';

type SseEvent = {
    event: string,
    data: string
};

type SseWakeupSourceContext = {
    /** Absolute URL of the Hub's `GET /messages/stream` SSE endpoint. */
    url: string,
    /** Resolves the `Authorization` header value (e.g. `Bearer <token>`) per connection. */
    authorization: () => Promise<string>,
    /** Injectable for tests; defaults to the global `fetch`. */
    fetchFn?: typeof fetch,
    /** Backoff between reconnect attempts. */
    reconnectDelayMs?: number,
    logger?: Logger
};

const DEFAULT_RECONNECT_DELAY_MS = 3000;

/**
 * Parse a byte stream of Server-Sent Events into `{ event, data }` records.
 * Pure and transport-agnostic: events are separated by a blank line, `event:`
 * sets the type (default `message`), and consecutive `data:` lines are joined
 * with newlines (per the SSE spec). Comment lines (`:`) and unknown fields are
 * ignored.
 */
export async function* parseSseStream(
    source: AsyncIterable<Uint8Array>,
): AsyncGenerator<SseEvent> {
    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of source) {
        buffer += decoder.decode(chunk, { stream: true });

        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);

            const event = parseSseBlock(block);
            if (event) {
                yield event;
            }

            boundary = buffer.indexOf('\n\n');
        }
    }
}

function parseSseBlock(block: string): SseEvent | undefined {
    let event = 'message';
    const data: string[] = [];

    for (const line of block.split('\n')) {
        if (line.length === 0 || line.startsWith(':')) {
            continue;
        }

        const separator = line.indexOf(':');
        const field = separator === -1 ? line : line.slice(0, separator);
        let value = separator === -1 ? '' : line.slice(separator + 1);
        if (value.startsWith(' ')) {
            value = value.slice(1);
        }

        if (field === 'event') {
            event = value;
        } else if (field === 'data') {
            data.push(value);
        }
    }

    if (data.length === 0) {
        return undefined;
    }

    return { event, data: data.join('\n') };
}

function isMessagePendingEvent(value: unknown): value is MessagePendingEvent {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const { recipient } = value as { recipient?: unknown };
    return typeof recipient === 'object' && recipient !== null;
}

async function* readableToAsyncIterable(
    stream: ReadableStream<Uint8Array>,
): AsyncIterable<Uint8Array> {
    const reader = stream.getReader();
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            if (value) {
                yield value;
            }
        }
    } finally {
        reader.releaseLock();
    }
}

/**
 * Consumes the Hub's `messagePending` SSE stream (`GET /messages/stream`) and
 * forwards each signal to subscribers. `EventSource` can't carry the node's
 * `Authorization` header, so the stream is read over `fetch`; the loop
 * auto-reconnects with backoff until {@link stop}. `ping` heartbeats and any
 * non-`messagePending` events are ignored.
 */
export class SseWakeupSource implements IWakeupSource {
    protected url: string;

    protected authorization: () => Promise<string>;

    protected fetchFn: typeof fetch;

    protected reconnectDelayMs: number;

    protected logger: Logger | undefined;

    protected listeners = new Set<(event: MessagePendingEvent) => void>();

    protected controller: AbortController | undefined;

    protected loop: Promise<void> | undefined;

    protected running = false;

    constructor(ctx: SseWakeupSourceContext) {
        this.url = ctx.url;
        this.authorization = ctx.authorization;
        this.fetchFn = ctx.fetchFn ?? fetch;
        this.reconnectDelayMs = ctx.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
        this.logger = ctx.logger;
    }

    subscribe(listener: (event: MessagePendingEvent) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    async start(): Promise<void> {
        if (this.running) {
            return;
        }

        this.running = true;
        this.loop = this.run();
    }

    async stop(): Promise<void> {
        this.running = false;
        if (this.controller) {
            this.controller.abort();
        }
        if (this.loop) {
            await this.loop;
            this.loop = undefined;
        }
    }

    protected async run(): Promise<void> {
        while (this.running) {
            try {
                await this.connect();
            } catch (error) {
                if (this.running) {
                    this.logger?.warn(`Message wakeup stream disconnected: ${(error as Error).message}`);
                }
            }

            if (this.running) {
                await this.delay(this.reconnectDelayMs);
            }
        }
    }

    protected async connect(): Promise<void> {
        const controller = new AbortController();
        this.controller = controller;

        const authorization = await this.authorization();
        const response = await this.fetchFn(this.url, {
            method: 'GET',
            headers: {
                accept: 'text/event-stream',
                authorization,
            },
            signal: controller.signal,
        });

        if (!response.ok || !response.body) {
            throw new Error(`unexpected response (status ${response.status})`);
        }

        for await (const event of parseSseStream(readableToAsyncIterable(response.body))) {
            if (event.event === WakeupEventName.MESSAGE_PENDING) {
                this.dispatch(event.data);
            }
        }
    }

    protected dispatch(data: string): void {
        let parsed: unknown;
        try {
            parsed = JSON.parse(data);
        } catch {
            return;
        }

        if (!isMessagePendingEvent(parsed)) {
            return;
        }

        for (const listener of this.listeners) {
            try {
                listener(parsed);
            } catch (error) {
                this.logger?.warn(`Message wakeup listener failed: ${(error as Error).message}`);
            }
        }
    }

    protected delay(ms: number): Promise<void> {
        return new Promise((resolve) => {
            const timer = setTimeout(resolve, ms);
            if (typeof timer.unref === 'function') {
                timer.unref();
            }
            this.controller?.signal.addEventListener('abort', () => {
                clearTimeout(timer);
                resolve();
            }, { once: true });
        });
    }
}
