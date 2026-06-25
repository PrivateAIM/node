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
    /**
     * Abort and reconnect if no event — including the Hub's `ping` heartbeats —
     * arrives within this window; guards against silently half-open connections
     * that never emit FIN/RST. Must exceed the Hub's heartbeat interval. `<= 0`
     * disables the watchdog.
     */
    idleTimeoutMs?: number,
    logger?: Logger
};

const DEFAULT_RECONNECT_DELAY_MS = 3000;

const DEFAULT_IDLE_TIMEOUT_MS = 60_000;

/**
 * Parse a byte stream of Server-Sent Events into `{ event, data }` records.
 * Pure and transport-agnostic: events are separated by a blank line, `event:`
 * sets the type (default `message`), and consecutive `data:` lines are joined
 * with newlines (per the SSE spec). CR / CRLF line endings are normalised to LF,
 * comment lines (`:`) and unknown fields are ignored.
 */
export async function* parseSseStream(
    source: AsyncIterable<Uint8Array>,
): AsyncGenerator<SseEvent> {
    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of source) {
        buffer += decoder.decode(chunk, { stream: true });

        // Normalise CR / CRLF to LF (SSE spec). A trailing CR is held back: it
        // may be the first half of a CRLF that is split across two chunks.
        let trailingCr = '';
        if (buffer.endsWith('\r')) {
            trailingCr = '\r';
            buffer = buffer.slice(0, -1);
        }
        buffer = buffer.replace(/\r\n?/g, '\n') + trailingCr;

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
    if (typeof recipient !== 'object' || recipient === null) {
        return false;
    }

    const { type, id } = recipient as { type?: unknown, id?: unknown };
    return typeof type === 'string' && typeof id === 'string';
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
 * auto-reconnects with backoff until {@link stop}, and an idle watchdog drops a
 * connection that has gone silent (no heartbeats) so it can be re-established.
 * `ping` heartbeats and any non-`messagePending` events are ignored.
 */
export class SseWakeupSource implements IWakeupSource {
    protected url: string;

    protected authorization: () => Promise<string>;

    protected fetchFn: typeof fetch;

    protected reconnectDelayMs: number;

    protected idleTimeoutMs: number;

    protected logger: Logger | undefined;

    protected listeners = new Set<(event: MessagePendingEvent) => void>();

    /** Aborted once, by {@link stop}, to tear the whole loop down. */
    protected stopController: AbortController | undefined;

    /** Aborted per connection — by {@link stop} or by the idle watchdog. */
    protected connController: AbortController | undefined;

    protected loop: Promise<void> | undefined;

    protected running = false;

    constructor(ctx: SseWakeupSourceContext) {
        this.url = ctx.url;
        this.authorization = ctx.authorization;
        this.fetchFn = ctx.fetchFn ?? fetch;
        this.reconnectDelayMs = ctx.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
        this.idleTimeoutMs = ctx.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
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
        this.stopController = new AbortController();
        this.loop = this.run();
    }

    async stop(): Promise<void> {
        this.running = false;
        this.stopController?.abort();
        this.connController?.abort();
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
        const { stopController } = this;
        if (!stopController) {
            return;
        }

        const conn = new AbortController();
        this.connController = conn;

        const authorization = await this.authorization();
        const response = await this.fetchFn(this.url, {
            method: 'GET',
            headers: {
                accept: 'text/event-stream',
                authorization,
            },
            signal: AbortSignal.any([stopController.signal, conn.signal]),
        });

        if (!response.ok || !response.body) {
            throw new Error(`unexpected response (status ${response.status})`);
        }

        let idleTimer: ReturnType<typeof setTimeout> | undefined;
        const armIdle = () => {
            if (this.idleTimeoutMs <= 0) {
                return;
            }
            if (idleTimer) {
                clearTimeout(idleTimer);
            }
            idleTimer = setTimeout(() => conn.abort(), this.idleTimeoutMs);
            if (typeof idleTimer.unref === 'function') {
                idleTimer.unref();
            }
        };

        try {
            armIdle();
            for await (const event of parseSseStream(readableToAsyncIterable(response.body))) {
                armIdle();
                if (event.event === WakeupEventName.MESSAGE_PENDING) {
                    this.dispatch(event.data);
                }
            }
        } finally {
            if (idleTimer) {
                clearTimeout(idleTimer);
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
            const signal = this.stopController?.signal;
            if (signal?.aborted) {
                resolve();
                return;
            }

            let timer: ReturnType<typeof setTimeout>;
            const onAbort = () => {
                clearTimeout(timer);
                resolve();
            };

            timer = setTimeout(() => {
                signal?.removeEventListener('abort', onAbort);
                resolve();
            }, ms);
            if (typeof timer.unref === 'function') {
                timer.unref();
            }

            signal?.addEventListener('abort', onAbort, { once: true });
        });
    }
}
