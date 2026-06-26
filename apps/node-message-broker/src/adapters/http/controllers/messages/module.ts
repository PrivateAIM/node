/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntityNotFoundError } from '@privateaim/errors';
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
    AnalysisMessagePayload,
    WebhookSubscriptionPayload,
} from './types.ts';
import {
    AnalysisMessageValidator,
    MESSAGE_SEND_GROUP,
    WebhookSubscriptionValidator,
} from './validators/index.ts';

/**
 * Container-facing API (auth: node-local Authup JWT — the analysis presents its
 * `KEYCLOAK_TOKEN`). The SDK-compatible surface is intentionally preserved: `recipients`
 * carry **node ids**, `message` is an opaque JSON payload relayed verbatim, sends answer
 * `202` with an empty body, and participant lists are bare arrays of `{ nodeId, nodeType }`.
 *
 * Request bodies are validated with validup + zod (see `./validators`); a validation
 * failure throws a `ValidupError` that the error middleware renders as a `400`. Every
 * analysis-scoped route is additionally gated by {@link authorize}: the caller must hold the
 * `ANALYSIS_SELF_MESSAGE_BROKER_USE` capability and own the analysis (the Hub stays
 * analysis-agnostic). Inbound delivery is webhook-push only (no pull endpoint), managed via
 * the subscription CRUD below.
 */
@DTags('messages')
@DController('/analyses')
export class AnalysisMessageController {
    protected delivery: IDeliveryService;

    protected resolver: IParticipantResolver;

    protected analyses: IAnalysisClientLookup;

    protected dispatch: MessageDispatchDeps;

    protected messageValidator: AnalysisMessageValidator;

    protected subscriptionValidator: WebhookSubscriptionValidator;

    constructor(ctx: AnalysisMessageControllerContext) {
        this.delivery = ctx.delivery;
        this.resolver = ctx.resolver;
        this.analyses = ctx.analyses;
        this.dispatch = {
            resolver: ctx.resolver,
            crypto: ctx.crypto,
            hub: ctx.hub,
        };
        this.messageValidator = new AnalysisMessageValidator();
        this.subscriptionValidator = new WebhookSubscriptionValidator();
    }

    @DPost('/:id/messages', [ForceLoggedInMiddleware])
    async send(
        @DPath('id') analysisId: string,
        @DBody() body: Partial<AnalysisMessagePayload>,
        @DContext() event: IAppEvent,
    ) {
        await this.authorize(event, analysisId);

        const { recipients, message } = await this.messageValidator.run(body, { group: MESSAGE_SEND_GROUP });

        await dispatchAnalysisMessage(this.dispatch, {
            analysisId,
            recipientNodeIds: recipients,
            data: JSON.stringify(message),
        });

        event.response.status = 202;
        return null;
    }

    @DPost('/:id/messages/broadcast', [ForceLoggedInMiddleware])
    async broadcast(
        @DPath('id') analysisId: string,
        @DBody() body: Partial<AnalysisMessagePayload>,
        @DContext() event: IAppEvent,
    ) {
        await this.authorize(event, analysisId);

        const { message } = await this.messageValidator.run(body);

        await broadcastAnalysisMessage(this.dispatch, {
            analysisId,
            data: JSON.stringify(message),
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
        @DBody() body: Partial<WebhookSubscriptionPayload>,
    ) {
        const { webhookUrl } = await this.subscriptionValidator.run(body);
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
        @DBody() body: Partial<WebhookSubscriptionPayload>,
    ) {
        const { webhookUrl } = await this.subscriptionValidator.run(body);
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
}
