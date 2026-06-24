/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MessagePendingEvent } from '@privateaim/messenger-kit';
import type { IWakeupSource } from '../../../../src/core/hub/index.ts';

/**
 * In-memory `IWakeupSource` whose {@link emit} drives wakeups synchronously and
 * which counts start/stop calls — lets the Hub adapter be tested without the SSE
 * transport.
 */
export class FakeWakeupSource implements IWakeupSource {
    listeners = new Set<(event: MessagePendingEvent) => void>();

    started = 0;

    stopped = 0;

    subscribe(listener: (event: MessagePendingEvent) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    async start(): Promise<void> {
        this.started += 1;
    }

    async stop(): Promise<void> {
        this.stopped += 1;
    }

    emit(event: MessagePendingEvent): void {
        for (const listener of this.listeners) {
            listener(event);
        }
    }
}
