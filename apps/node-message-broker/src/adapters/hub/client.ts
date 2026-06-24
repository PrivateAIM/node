/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Message, MessagePullResponse } from '@privateaim/messenger-kit';
import type { IHubClient } from '../../core/hub/index.ts';

const NOT_IMPLEMENTED = 'HubClient is a Phase 4 stub (Plan 013 Track B): implement against @privateaim/messenger-http-kit + the SSE wakeup stream.';

/**
 * Hub-link adapter. Phase 4 implements this with the `@privateaim/messenger-http-kit`
 * Hapic client (REST `send` / `pull` / `ack`) authenticating as the node client, plus
 * the SSE wakeup stream (`GET /messages/stream`) feeding `onWakeup`.
 */
export class HubClient implements IHubClient {
    async send(): Promise<Message[]> {
        throw new Error(NOT_IMPLEMENTED);
    }

    async pull(): Promise<MessagePullResponse> {
        throw new Error(NOT_IMPLEMENTED);
    }

    async ack(): Promise<void> {
        throw new Error(NOT_IMPLEMENTED);
    }

    onWakeup(): () => void {
        return () => {};
    }

    async start(): Promise<void> {
        // no-op until the Phase 4 SSE subscription lands
    }

    async stop(): Promise<void> {
        // no-op until the Phase 4 SSE subscription lands
    }
}
