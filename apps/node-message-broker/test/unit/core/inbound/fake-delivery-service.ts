/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IDeliveryService, WebhookSubscription } from '../../../../src/core/delivery/index.ts';

/**
 * In-memory `IDeliveryService` recording every decrypted delivery. Analyses in
 * {@link failAnalyses} make `deliver` reject, modelling a downstream webhook failure.
 */
export class FakeDeliveryService implements IDeliveryService {
    delivered: { analysisId: string, message: unknown }[] = [];

    failAnalyses = new Set<string>();

    register = async (): Promise<void> => {};

    unregister = async (): Promise<void> => {};

    list = async (): Promise<WebhookSubscription[]> => [];

    deliver = async (analysisId: string, message: unknown): Promise<void> => {
        if (this.failAnalyses.has(analysisId)) {
            throw new Error('delivery failed');
        }

        this.delivered.push({ analysisId, message });
    };
}
