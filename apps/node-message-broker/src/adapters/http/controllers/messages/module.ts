/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BadRequestError } from '@privateaim/errors';
import { ForceLoggedInMiddleware } from '@privateaim/server-http-kit';
import {
    DBody,
    DController,
    DDelete,
    DGet,
    DPath,
    DPost,
    DTags,
} from '@routup/decorators';
import type { IDeliveryService } from '../../../../core/delivery/index.ts';

type AnalysisMessageControllerContext = {
    delivery: IDeliveryService
};

/**
 * Container-facing API (auth: node-local Authup JWT — the analysis presents its
 * `KEYCLOAK_TOKEN`). The SDK-compatible surface is intentionally preserved.
 *
 * Implemented: webhook-subscription CRUD (the default delivery transport).
 * TODO (Plan 013 Track B, Phase 4): `POST /:id/messages`, `…/broadcast`,
 * `GET /:id/participants`, `…/participants/self`, and the additive pull endpoint.
 */
@DTags('messages')
@DController('/analyses')
export class AnalysisMessageController {
    protected delivery: IDeliveryService;

    constructor(ctx: AnalysisMessageControllerContext) {
        this.delivery = ctx.delivery;
    }

    @DPost('/:id/messages/subscriptions', [ForceLoggedInMiddleware])
    async subscribe(
        @DPath('id') analysisId: string,
        @DBody() data: { webhookUrl?: string },
    ) {
        const webhookUrl = this.requireWebhookUrl(data);
        await this.delivery.register({ analysisId, webhookUrl });
        return { analysisId, webhookUrl };
    }

    @DGet('/:id/messages/subscriptions', [ForceLoggedInMiddleware])
    async listSubscriptions(@DPath('id') analysisId: string) {
        const data = await this.delivery.list(analysisId);
        return { data, meta: { total: data.length } };
    }

    @DDelete('/:id/messages/subscriptions', [ForceLoggedInMiddleware])
    async unsubscribe(
        @DPath('id') analysisId: string,
        @DBody() data: { webhookUrl?: string },
    ) {
        const webhookUrl = this.requireWebhookUrl(data);
        await this.delivery.unregister(analysisId, webhookUrl);
        return { analysisId, webhookUrl };
    }

    protected requireWebhookUrl(data: { webhookUrl?: string }): string {
        if (!data || typeof data.webhookUrl !== 'string' || data.webhookUrl.length === 0) {
            throw new BadRequestError('A webhookUrl is required.');
        }
        return data.webhookUrl;
    }
}
