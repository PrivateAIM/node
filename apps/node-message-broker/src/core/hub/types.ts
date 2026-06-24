/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    Message,
    MessageAckRequest,
    MessageParty,
    MessagePullResponse,
    SendMessageRequest,
} from '@privateaim/messenger-kit';

/**
 * Port to the Hub durable message broker. The node relays sends to the Hub
 * mailbox and pulls inbound ciphertext from it; a payload-free wakeup (SSE
 * preferred) triggers an immediate pull, with long-poll as the fallback.
 *
 * Implemented in `adapters/hub` via `@privateaim/messenger-http-kit`.
 */
export interface IHubClient {
    /** Persist one row per recipient in the Hub mailbox. */
    send(input: SendMessageRequest): Promise<Message[]>;

    /** Cursor-based pull of messages addressed to this node; `wait` long-polls. */
    pull(input?: { after?: string; wait?: number }): Promise<MessagePullResponse>;

    /** Advance the recipient cursor (deletes acknowledged rows). */
    ack(input: MessageAckRequest): Promise<void>;

    /** Subscribe to payload-free `messagePending` wakeups; returns an unsubscribe fn. */
    onWakeup(listener: (recipient: MessageParty) => void): () => void;

    start(): Promise<void>;
    stop(): Promise<void>;
}
