/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IDeliveryService, WebhookSubscription } from '../../core/delivery/index.ts';

/**
 * In-memory webhook-subscription registry + fan-out delivery. The webhook
 * subscriptions are the only local state the node keeps; a durable store can
 * replace this behind the same port without touching callers.
 */
export class MemoryDeliveryService implements IDeliveryService {
    private subscriptions = new Map<string, Set<string>>();

    async register(subscription: WebhookSubscription): Promise<void> {
        let set = this.subscriptions.get(subscription.analysisId);
        if (!set) {
            set = new Set();
            this.subscriptions.set(subscription.analysisId, set);
        }
        set.add(subscription.webhookUrl);
    }

    async unregister(analysisId: string, webhookUrl: string): Promise<void> {
        const set = this.subscriptions.get(analysisId);
        if (!set) {
            return;
        }
        set.delete(webhookUrl);
        if (set.size === 0) {
            this.subscriptions.delete(analysisId);
        }
    }

    async list(analysisId: string): Promise<WebhookSubscription[]> {
        const set = this.subscriptions.get(analysisId);
        if (!set) {
            return [];
        }
        return [...set].map((webhookUrl) => ({ analysisId, webhookUrl }));
    }

    async deliver(analysisId: string, message: unknown): Promise<void> {
        const set = this.subscriptions.get(analysisId);
        if (!set || set.size === 0) {
            return;
        }

        await Promise.allSettled([...set].map((url) => fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(message),
        })));
    }
}
