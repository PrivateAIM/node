/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createValidator } from '@validup/zod';
import { Container } from 'validup';
import zod from 'zod';
import type { WebhookSubscriptionPayload } from '../types.ts';

/** Validates a webhook-subscription body — a single required, absolute `webhookUrl`. */
export class WebhookSubscriptionValidator extends Container<WebhookSubscriptionPayload> {
    protected initialize() {
        super.initialize();

        this.mount('webhookUrl', createValidator(zod.url()));
    }
}
