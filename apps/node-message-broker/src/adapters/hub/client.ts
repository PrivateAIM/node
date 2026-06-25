/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    MessageAckRequest,
    MessageParty,
    MessagePullQuery,
    MessagePullResponse,
    SendMessageRequest,
} from '@privateaim/messenger-kit';
import type {
    IHubClient,
    IMessengerClient,
    IWakeupSource,
} from '../../core/hub/index.ts';

type HubClientContext = {
    client: IMessengerClient,
    wakeup: IWakeupSource
};

/**
 * Hub-link adapter. REST `send` / `pull` / `ack` go through the
 * `@privateaim/messenger-http-kit` client (authenticated as the node client);
 * `onWakeup` rides the SSE wakeup source. The node relays opaque end-to-end
 * payloads — encryption/decryption is the caller's concern, not the Hub's.
 */
export class HubClient implements IHubClient {
    protected client: IMessengerClient;

    protected wakeup: IWakeupSource;

    constructor(ctx: HubClientContext) {
        this.client = ctx.client;
        this.wakeup = ctx.wakeup;
    }

    send(input: SendMessageRequest): Promise<string[]> {
        return this.client.message.send(input);
    }

    pull(query?: MessagePullQuery): Promise<MessagePullResponse> {
        return this.client.message.pull(query);
    }

    ack(input: MessageAckRequest): Promise<void> {
        return this.client.message.ack(input);
    }

    onWakeup(listener: (recipient: MessageParty) => void): () => void {
        return this.wakeup.subscribe((event) => listener(event.recipient));
    }

    start(): Promise<void> {
        return this.wakeup.start();
    }

    stop(): Promise<void> {
        return this.wakeup.stop();
    }
}
