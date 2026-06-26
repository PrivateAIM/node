/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Message, MessagePullResponse } from '@privateaim/messenger-kit';
import { InboundProcessingError } from './errors.ts';
import type { InboundDeliveryDeps, InboundProcessorOptions } from './types.ts';

const DEFAULT_PULL_LIMIT = 50;
const DEFAULT_WAIT_MS = 20_000;
const DEFAULT_ERROR_BACKOFF_MS = 1_000;
const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Drives the inbound side of the broker: pull this node's pending ciphertext from the Hub,
 * resolve each message's **sender** node key, decrypt it (S1), and fan it out to the
 * analysis's local webhooks (S6). Two pull triggers feed the same pipeline:
 *
 * - **wakeup** — a payload-free `messagePending` SSE signal triggers an immediate backlog
 *   drain (coalesced single-flight, so a burst of signals collapses into one drain);
 * - **long-poll fallback** — a background loop parks on `pull({ wait })` to catch anything a
 *   missed wakeup would otherwise leave sitting until the next signal.
 *
 * Delivery is delete-on-ack at-least-once: only successfully delivered messages are acked,
 * so a transient failure is retried on the next pull. A per-message failure (no
 * `analysisId`, unknown sender, decrypt/parse error) is isolated — logged and skipped, never
 * fatal to the batch — and left unacked for redelivery. The receiving SDK dedupes by its own
 * `meta.id`, so an occasional duplicate from concurrent triggers is harmless.
 */
export class InboundDeliveryProcessor {
    protected deps: InboundDeliveryDeps;

    protected pullLimit: number;

    protected waitMs: number;

    protected errorBackoffMs: number;

    protected maxAttempts: number;

    /** transient-failure attempt counts, keyed by message id; cleared on success or drop */
    protected readonly attempts = new Map<string, number>();

    /** messages dead-lettered (acked to drop) — exposed for metrics/observability */
    protected dropped = 0;

    protected running = false;

    protected unsubscribe: (() => void) | undefined;

    protected fallbackLoop: Promise<void> | undefined;

    protected wakeupInFlight: Promise<void> | undefined;

    protected wakeupPending = false;

    protected resolveStop: (() => void) | undefined;

    private readonly decoder = new TextDecoder();

    constructor(deps: InboundDeliveryDeps, options: InboundProcessorOptions = {}) {
        this.deps = deps;
        this.pullLimit = options.pullLimit ?? DEFAULT_PULL_LIMIT;
        this.waitMs = options.waitMs ?? DEFAULT_WAIT_MS;
        this.errorBackoffMs = options.errorBackoffMs ?? DEFAULT_ERROR_BACKOFF_MS;
        this.maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    }

    /** Count of messages dead-lettered (dropped via ack) so far — for metrics/tests. */
    get droppedCount(): number {
        return this.dropped;
    }

    /** Subscribe to Hub wakeups and start the long-poll fallback loop. Idempotent. */
    start(): void {
        if (this.running) {
            return;
        }

        this.running = true;
        this.unsubscribe = this.deps.hub.onWakeup(() => this.onWakeupSignal());
        this.fallbackLoop = this.runFallbackLoop();
    }

    /** Unsubscribe, unblock the long-poll, and await both triggers settling. Idempotent. */
    async stop(): Promise<void> {
        if (!this.running) {
            return;
        }

        this.running = false;

        this.unsubscribe?.();
        this.unsubscribe = undefined;

        // release the fallback loop if it is parked on a long-poll pull
        this.resolveStop?.();

        const inFlight = this.wakeupInFlight;
        const loop = this.fallbackLoop;
        this.fallbackLoop = undefined;

        await inFlight?.catch(() => undefined);
        await loop?.catch(() => undefined);
    }

    /** Resolve once the current wakeup-triggered drain has settled (diagnostic / test aid). */
    async whenIdle(): Promise<void> {
        await this.wakeupInFlight?.catch(() => undefined);
    }

    /**
     * Decrypt and locally deliver a batch, returning the ids of the messages that were acked.
     * The ack covers both successfully delivered messages and **dead-lettered** ones —
     * permanent failures (no `analysisId`, unknown sender, decrypt/parse error) are dropped
     * on the first attempt, and transient failures (resolution/webhook outage) are retried up
     * to `maxAttempts` redeliveries before being dropped. A still-retrying transient failure
     * is left unacked so the Hub redelivers it. Dropped messages are logged at `error` and
     * counted ({@link droppedCount}); the batch is never aborted by one bad message.
     */
    async processBatch(messages: Message[]): Promise<string[]> {
        const ackIds: string[] = [];

        for (const message of messages) {
            try {
                await this.deliverMessage(message);
                this.attempts.delete(message.id);
                ackIds.push(message.id);
            } catch (error) {
                if (this.shouldDeadLetter(message, error)) {
                    ackIds.push(message.id);
                }
            }
        }

        if (ackIds.length > 0) {
            try {
                await this.deps.hub.ack({ ids: ackIds });
            } catch (error) {
                this.deps.logger?.error(`Failed to ack inbound messages ${ackIds.join(', ')}: ${(error as Error).message}`);
            }
        }

        return ackIds;
    }

    /**
     * Record a failed attempt and decide whether to dead-letter (ack-to-drop) the message.
     * Returns `true` when the message should be acked away — a permanent failure, or a
     * transient one that has exhausted `maxAttempts`. A transient failure with attempts
     * remaining returns `false` (left unacked for redelivery).
     */
    protected shouldDeadLetter(message: Message, error: unknown): boolean {
        const permanent = error instanceof InboundProcessingError && error.permanent;
        const reason = error instanceof Error ? error.message : String(error);

        if (permanent) {
            this.attempts.delete(message.id);
            this.dropped += 1;
            this.deps.logger?.error(`Dropping inbound message ${message.id} (permanent): ${reason}`);
            return true;
        }

        const attempts = (this.attempts.get(message.id) ?? 0) + 1;
        if (attempts >= this.maxAttempts) {
            this.attempts.delete(message.id);
            this.dropped += 1;
            this.deps.logger?.error(`Dropping inbound message ${message.id} after ${attempts} attempts (transient): ${reason}`);
            return true;
        }

        this.attempts.set(message.id, attempts);
        this.deps.logger?.warn(`Inbound message ${message.id} attempt ${attempts}/${this.maxAttempts} failed (transient): ${reason}`);
        return false;
    }

    /** Drain the backlog: pull (no wait) and process repeatedly until the mailbox is empty. */
    protected async drainBacklog(): Promise<void> {
        while (this.running) {
            const { messages } = await this.deps.hub.pull({ limit: this.pullLimit });
            if (messages.length === 0) {
                return;
            }

            await this.processBatch(messages);

            if (messages.length < this.pullLimit) {
                return;
            }
        }
    }

    /** Coalesce wakeup signals into a single in-flight backlog drain. */
    protected onWakeupSignal(): void {
        if (this.wakeupInFlight) {
            this.wakeupPending = true;
            return;
        }

        this.wakeupInFlight = this.drainBacklog()
            .catch((error) => {
                this.deps.logger?.warn(`Inbound wakeup drain failed: ${(error as Error).message}`);
            })
            .finally(() => {
                this.wakeupInFlight = undefined;
                if (this.wakeupPending && this.running) {
                    this.wakeupPending = false;
                    this.onWakeupSignal();
                }
            });
    }

    /** Long-poll the Hub as a fallback for missed wakeups until {@link stop}. */
    protected async runFallbackLoop(): Promise<void> {
        const stopped = new Promise<void>((resolve) => {
            this.resolveStop = resolve;
        });

        while (this.running) {
            let result: MessagePullResponse | undefined;
            try {
                result = await Promise.race([
                    this.deps.hub.pull({ limit: this.pullLimit, wait: this.waitMs }),
                    stopped.then(() => undefined),
                ]);
            } catch (error) {
                if (!this.running) {
                    return;
                }
                this.deps.logger?.warn(`Inbound long-poll failed: ${(error as Error).message}`);
                await Promise.race([this.sleep(this.errorBackoffMs), stopped]);
                continue;
            }

            if (!this.running || !result) {
                return;
            }

            if (result.messages.length > 0) {
                await this.processBatch(result.messages);
            }
        }
    }

    /**
     * Decrypt one inbound message and deliver it to the analysis's webhooks. Throws an
     * {@link InboundProcessingError} tagged `permanent` for failures that cannot succeed on
     * retry (bad envelope, unknown sender, decrypt/parse error) and `transient` for outages
     * (participant resolution, webhook delivery) that warrant a retry.
     */
    protected async deliverMessage(message: Message): Promise<void> {
        const analysisId = message.metadata?.analysisId;
        if (!analysisId) {
            throw new InboundProcessingError('message carries no analysisId metadata', { permanent: true });
        }
        if (typeof message.data !== 'string') {
            throw new InboundProcessingError('message carries no ciphertext payload', { permanent: true });
        }

        const senderPublicKey = await this.resolveSenderPublicKey(analysisId, message.sender_id);

        // `analysisId` is bound into the key derivation (HKDF info, matching the seal path),
        // so a `metadata.analysisId` relabelled in transit by the untrusted Hub fails to
        // decrypt here rather than being mis-routed to another analysis's webhooks.
        let payload: unknown;
        try {
            const plaintext = await this.deps.crypto.open(message.data, senderPublicKey, analysisId);
            payload = JSON.parse(this.decoder.decode(plaintext));
        } catch (error) {
            throw new InboundProcessingError('failed to decrypt or parse message payload', { permanent: true, cause: error });
        }

        try {
            await this.deps.delivery.deliver(analysisId, payload);
        } catch (error) {
            throw new InboundProcessingError('failed to deliver message to the analysis webhooks', { permanent: false, cause: error });
        }
    }

    /** Map a sender client id to its node public key via the analysis participant set. */
    protected async resolveSenderPublicKey(analysisId: string, senderId: string): Promise<string> {
        let participants;
        try {
            participants = await this.deps.resolver.resolve(analysisId);
        } catch (error) {
            // a resolver/server-core outage is transient — retry rather than drop
            throw new InboundProcessingError('failed to resolve analysis participants', { permanent: false, cause: error });
        }

        const sender = participants.find((participant) => participant.clientId === senderId);
        if (!sender) {
            throw new InboundProcessingError(`sender '${senderId}' is not a participant of analysis '${analysisId}'`, { permanent: true });
        }

        return sender.publicKey;
    }

    protected sleep(ms: number): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }
}
