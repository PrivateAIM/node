/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BadRequestError, EntityNotFoundError } from '@privateaim/errors';
import { PermissionName } from '@privateaim/kit';
import {
    ForceLoggedInMiddleware,
    useRequestIdentity,
    useRequestPermissionChecker,
} from '@privateaim/server-http-kit';
import {
    DBody,
    DContext,
    DController,
    DDelete,
    DGet,
    DPath,
    DPost,
    DTags,
} from '@routup/decorators';
import type { IAppEvent } from 'routup';
import { assertClientOwnsAnalysis } from '../../../../core/analysis/index.ts';
import type { IAnalysisClientLookup, IParticipantResolver } from '../../../../core/analysis/index.ts';
import type { IDeliveryService } from '../../../../core/delivery/index.ts';
import { broadcastAnalysisMessage, dispatchAnalysisMessage } from '../../../../core/messaging/index.ts';
import type { MessageDispatchDeps } from '../../../../core/messaging/index.ts';
import type {
    AnalysisMessageControllerContext,
    MessageBroadcastBody,
    MessageSendBody,
    WebhookSubscriptionBody,
} from './types.ts';

/**
 * Container-facing API (auth: node-local Authup JWT — the analysis presents its
 * `KEYCLOAK_TOKEN`). The SDK-compatible surface is intentionally preserved: `recipients`
 * carry **node ids**, `message` is an opaque JSON payload relayed verbatim, sends answer
 * `202` with an empty body, and participant lists are bare arrays of `{ nodeId, nodeType }`.
 *
 * Every analysis-scoped route is gated by {@link authorize}: the caller must hold the
 * `ANALYSIS_SELF_MESSAGE_BROKER_USE` capability and own the analysis (the Hub stays
 * analysis-agnostic). Inbound delivery is webhook-push only (no pull endpoint), managed
 * via the subscription CRUD below.
 */
@DTags('messages')
@DController('/analyses')
export class AnalysisMessageController {
    protected delivery: IDeliveryService;

    protected resolver: IParticipantResolver;

    protected analyses: IAnalysisClientLookup;

    protected dispatch: MessageDispatchDeps;

    constructor(ctx: AnalysisMessageControllerContext) {
        this.delivery = ctx.delivery;
        this.resolver = ctx.resolver;
        this.analyses = ctx.analyses;
        this.dispatch = {
            resolver: ctx.resolver,
            crypto: ctx.crypto,
            hub: ctx.hub,
        };
    }

    @DPost('/:id/messages', [ForceLoggedInMiddleware])
    async send(
        @DPath('id') analysisId: string,
        @DBody() body: MessageSendBody,
        @DContext() event: IAppEvent,
    ) {
        await this.authorize(event, analysisId);

        await dispatchAnalysisMessage(this.dispatch, {
            analysisId,
            recipientNodeIds: this.requireRecipients(body),
            data: JSON.stringify(this.requireMessage(body)),
        });

        event.response.status = 202;
        return null;
    }

    @DPost('/:id/messages/broadcast', [ForceLoggedInMiddleware])
    async broadcast(
        @DPath('id') analysisId: string,
        @DBody() body: MessageBroadcastBody,
        @DContext() event: IAppEvent,
    ) {
        await this.authorize(event, analysisId);

        await broadcastAnalysisMessage(this.dispatch, {
            analysisId,
            data: JSON.stringify(this.requireMessage(body)),
        });

        event.response.status = 202;
        return null;
    }

    @DGet('/:id/participants', [ForceLoggedInMiddleware])
    async listParticipants(
        @DPath('id') analysisId: string,
        @DContext() event: IAppEvent,
    ) {
        await this.authorize(event, analysisId);

        const participants = await this.resolver.resolve(analysisId);
        return participants.map((participant) => ({
            nodeId: participant.nodeId,
            nodeType: participant.nodeType,
        }));
    }

    @DGet('/:id/participants/self', [ForceLoggedInMiddleware])
    async getSelfParticipant(
        @DPath('id') analysisId: string,
        @DContext() event: IAppEvent,
    ) {
        await this.authorize(event, analysisId);

        const self = await this.resolver.resolveSelf(analysisId);
        if (!self) {
            throw new EntityNotFoundError('No self participant exists for this analysis.');
        }

        return {
            nodeId: self.nodeId,
            nodeType: self.nodeType,
        };
    }

    @DPost('/:id/messages/subscriptions', [ForceLoggedInMiddleware])
    async subscribe(
        @DPath('id') analysisId: string,
        @DBody() data: WebhookSubscriptionBody,
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
        @DBody() data: WebhookSubscriptionBody,
    ) {
        const webhookUrl = this.requireWebhookUrl(data);
        await this.delivery.unregister(analysisId, webhookUrl);
        return { analysisId, webhookUrl };
    }

    /**
     * Authorize an analysis-scoped request: assert the caller holds
     * `ANALYSIS_SELF_MESSAGE_BROKER_USE` (capability, via the request permission checker)
     * and that the caller's client owns `analysisId` (node-side analysis scope). Either
     * check failing throws and aborts the request.
     */
    protected async authorize(event: IAppEvent, analysisId: string): Promise<void> {
        await useRequestPermissionChecker(event)
            .check({ name: PermissionName.ANALYSIS_SELF_MESSAGE_BROKER_USE });

        const identity = useRequestIdentity(event);
        const clientId = identity?.type === 'client' ? identity.id : undefined;
        await assertClientOwnsAnalysis(this.analyses, analysisId, clientId);
    }

    protected requireRecipients(body: MessageSendBody): string[] {
        const recipients = body?.recipients;
        if (
            !Array.isArray(recipients) ||
            recipients.length === 0 ||
            recipients.some((recipient) => typeof recipient !== 'string' || recipient.length === 0)
        ) {
            throw new BadRequestError('A non-empty recipients array of node ids is required.');
        }
        return recipients as string[];
    }

    protected requireMessage(body: MessageBroadcastBody): unknown {
        if (!body || body.message === undefined || body.message === null) {
            throw new BadRequestError('A message payload is required.');
        }
        return body.message;
    }

    protected requireWebhookUrl(data: WebhookSubscriptionBody): string {
        if (!data || typeof data.webhookUrl !== 'string' || data.webhookUrl.length === 0) {
            throw new BadRequestError('A webhookUrl is required.');
        }
        return data.webhookUrl;
    }
}
