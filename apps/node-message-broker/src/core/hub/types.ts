/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    MessageAckRequest,
    MessageParty,
    MessagePendingEvent,
    MessagePullQuery,
    MessagePullResponse,
    SendMessageRequest,
} from '@privateaim/messenger-kit';

/**
 * The slice of the `@privateaim/messenger-http-kit` message API the broker relies
 * on. Declared structurally so the Hub adapter can be tested with a fake instead
 * of a live HTTP client.
 */
export interface IMessengerMessageApi {
    send(data: SendMessageRequest): Promise<string[]>;

    pull(query?: MessagePullQuery): Promise<MessagePullResponse>;

    ack(data: MessageAckRequest): Promise<void>;
}

/** The shape of the `@privateaim/messenger-http-kit` `Client` the broker depends on. */
export interface IMessengerClient {
    message: IMessengerMessageApi;
}

/**
 * Payload-free wakeup channel. The Hub emits a `messagePending` signal — carrying
 * only the recipient identity, never the payload — over SSE; the source forwards
 * each signal to its subscribers, which respond by pulling via
 * {@link IHubClient.pull}. Implemented in `adapters/hub` over the Hub's
 * `GET /messages/stream` endpoint.
 */
export interface IWakeupSource {
    /** Register a wakeup listener; returns an unsubscribe fn. */
    subscribe(listener: (event: MessagePendingEvent) => void): () => void;

    /** Open the wakeup channel (auto-reconnecting until {@link stop}). */
    start(): Promise<void>;

    /** Close the wakeup channel. */
    stop(): Promise<void>;
}

/**
 * Port to the Hub durable message broker. The node relays sends to the Hub
 * mailbox and pulls inbound ciphertext from it; a payload-free wakeup (SSE)
 * triggers an immediate pull, with the pull's own `wait` long-poll as fallback.
 *
 * Implemented in `adapters/hub` via `@privateaim/messenger-http-kit` plus an
 * {@link IWakeupSource}.
 */
export interface IHubClient {
    /** Persist one row per recipient in the Hub mailbox; resolves with their ids. */
    send(input: SendMessageRequest): Promise<string[]>;

    /** Pull this node's pending messages (oldest first); `wait` long-polls. */
    pull(query?: MessagePullQuery): Promise<MessagePullResponse>;

    /** Acknowledge messages by id — the Hub deletes them for this node. */
    ack(input: MessageAckRequest): Promise<void>;

    /** Subscribe to payload-free `messagePending` wakeups; returns an unsubscribe fn. */
    onWakeup(listener: (recipient: MessageParty) => void): () => void;

    start(): Promise<void>;

    stop(): Promise<void>;
}
