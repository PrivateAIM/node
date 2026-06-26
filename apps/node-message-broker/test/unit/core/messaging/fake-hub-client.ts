/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MessagePullResponse, SendMessageRequest } from '@privateaim/messenger-kit';
import type { IHubClient } from '../../../../src/core/hub/index.ts';

/**
 * In-memory `IHubClient` recording every `send` and minting one id per recipient.
 * The pull/ack/wakeup/lifecycle members are inert — the dispatch path only sends.
 */
export class FakeHubClient implements IHubClient {
    sends: SendMessageRequest[] = [];

    private counter = 0;

    send = async (input: SendMessageRequest): Promise<string[]> => {
        this.sends.push(input);
        return input.recipients.map(() => {
            this.counter += 1;
            return `msg-${this.counter}`;
        });
    };

    pull = async (): Promise<MessagePullResponse> => ({ messages: [] });

    ack = async (): Promise<void> => {};

    onWakeup = (): (() => void) => () => {};

    start = async (): Promise<void> => {};

    stop = async (): Promise<void> => {};
}
