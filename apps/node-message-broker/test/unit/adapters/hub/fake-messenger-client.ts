/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    MessageAckRequest,
    MessagePullQuery,
    MessagePullResponse,
    SendMessageRequest,
} from '@privateaim/messenger-kit';
import type { IMessengerClient, IMessengerMessageApi } from '../../../../src/core/hub/index.ts';

/**
 * In-memory `IMessengerClient` that records every send/pull/ack and returns
 * configurable canned results — stands in for the `@privateaim/messenger-http-kit`
 * `Client` so the Hub adapter is testable without a live Hub.
 */
export class FakeMessengerClient implements IMessengerClient {
    sent: SendMessageRequest[] = [];

    pulled: (MessagePullQuery | undefined)[] = [];

    acked: MessageAckRequest[] = [];

    sendResult: string[] = [];

    pullResult: MessagePullResponse = { messages: [] };

    message: IMessengerMessageApi = {
        send: async (data) => {
            this.sent.push(data);
            return this.sendResult;
        },
        pull: async (query) => {
            this.pulled.push(query);
            return this.pullResult;
        },
        ack: async (data) => {
            this.acked.push(data);
        },
    };
}
