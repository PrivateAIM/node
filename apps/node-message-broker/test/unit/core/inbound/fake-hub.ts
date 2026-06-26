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
    MessagePullQuery,
    MessagePullResponse,
} from '@privateaim/messenger-kit';
import type { IHubClient } from '../../../../src/core/hub/index.ts';

/**
 * In-memory `IHubClient` for the inbound loop. A no-wait `pull` (the backlog drain) returns
 * the next seeded batch; a long-poll `pull({ wait })` (the fallback loop) parks until
 * {@link releaseParked} or the processor's stop barrier unblocks it. Records acks and exposes
 * wakeup emission so tests can drive the wakeup → drain path.
 */
export class FakeInboundHubClient implements IHubClient {
    /** batches handed out by successive no-wait pulls; empty once exhausted */
    pullBatches: Message[][] = [];

    /** ids passed to every `ack` call */
    acked: string[][] = [];

    private wakeupListeners: ((recipient: MessageParty) => void)[] = [];

    private parkedResolvers: ((value: MessagePullResponse) => void)[] = [];

    send = async (): Promise<string[]> => [];

    pull = async (query?: MessagePullQuery): Promise<MessagePullResponse> => {
        if (query?.wait != null) {
            return new Promise<MessagePullResponse>((resolve) => {
                this.parkedResolvers.push(resolve);
            });
        }

        return { messages: this.pullBatches.shift() ?? [] };
    };

    ack = async (input: MessageAckRequest): Promise<void> => {
        this.acked.push(input.ids);
    };

    onWakeup = (listener: (recipient: MessageParty) => void): (() => void) => {
        this.wakeupListeners.push(listener);
        return () => {
            this.wakeupListeners = this.wakeupListeners.filter((entry) => entry !== listener);
        };
    };

    start = async (): Promise<void> => {};

    stop = async (): Promise<void> => {};

    /** test helper: deliver a wakeup to every current listener */
    emitWakeup(recipient: MessageParty): void {
        for (const listener of [...this.wakeupListeners]) {
            listener(recipient);
        }
    }

    get wakeupListenerCount(): number {
        return this.wakeupListeners.length;
    }

    /** test helper: resolve any parked long-poll pulls with an empty batch */
    releaseParked(): void {
        const resolvers = this.parkedResolvers;
        this.parkedResolvers = [];
        for (const resolve of resolvers) {
            resolve({ messages: [] });
        }
    }
}
