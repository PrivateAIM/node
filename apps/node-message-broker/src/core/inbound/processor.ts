/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Message, MessagePullResponse } from '@privateaim/messenger-kit';
import type { InboundDeliveryDeps, InboundProcessorOptions } from './types.ts';

const DEFAULT_PULL_LIMIT = 50;
const DEFAULT_WAIT_MS = 20_000;
const DEFAULT_ERROR_BACKOFF_MS = 1_000;

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
     * Decrypt and locally deliver a batch, returning the ids of the messages that were
     * delivered (and acked). Per-message failures are isolated; the ack covers only the
     * delivered subset so the rest are redelivered on a later pull.
     */
    async processBatch(messages: Message[]): Promise<string[]> {
        const ackIds: string[] = [];

        for (const message of messages) {
            try {
                await this.deliverMessage(message);
                ackIds.push(message.id);
            } catch (error) {
                this.deps.logger?.warn(`Inbound message ${message.id} skipped: ${(error as Error).message}`);
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

    /** Decrypt one inbound message and deliver it to the analysis's webhooks. */
    protected async deliverMessage(message: Message): Promise<void> {
        const analysisId = message.metadata?.analysisId;
        if (!analysisId) {
            throw new Error('message carries no analysisId metadata');
        }
        if (typeof message.data !== 'string') {
            throw new Error('message carries no ciphertext payload');
        }

        const senderPublicKey = await this.resolveSenderPublicKey(analysisId, message.sender_id);
        const plaintext = await this.deps.crypto.open(message.data, senderPublicKey);
        const payload = JSON.parse(this.decoder.decode(plaintext));

        await this.deps.delivery.deliver(analysisId, payload);
    }

    /** Map a sender client id to its node public key via the analysis participant set. */
    protected async resolveSenderPublicKey(analysisId: string, senderId: string): Promise<string> {
        const participants = await this.deps.resolver.resolve(analysisId);
        const sender = participants.find((participant) => participant.clientId === senderId);
        if (!sender) {
            throw new Error(`sender '${senderId}' is not a participant of analysis '${analysisId}'`);
        }

        return sender.publicKey;
    }

    protected sleep(ms: number): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }
}
