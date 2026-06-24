/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** A container's registered webhook endpoint for an analysis. */
export type WebhookSubscription = {
    analysisId: string,
    webhookUrl: string
};

/**
 * Local delivery of decrypted inbound messages to analysis containers.
 * Default transport is a webhook POST; a future SDK may pull instead.
 * The webhook-subscription registry is the only local state the node keeps.
 */
export interface IDeliveryService {
    register(subscription: WebhookSubscription): Promise<void>;

    unregister(analysisId: string, webhookUrl: string): Promise<void>;

    list(analysisId: string): Promise<WebhookSubscription[]>;

    /** Deliver an already-decrypted message to every webhook for the analysis. */
    deliver(analysisId: string, message: unknown): Promise<void>;
}
