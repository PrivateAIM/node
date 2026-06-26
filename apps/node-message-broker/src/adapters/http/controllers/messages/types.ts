/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IAnalysisClientLookup, IParticipantResolver } from '../../../../core/analysis/index.ts';
import type { ICryptoService } from '../../../../core/crypto/index.ts';
import type { IDeliveryService } from '../../../../core/delivery/index.ts';
import type { IHubClient } from '../../../../core/hub/index.ts';

/** Dependencies injected into {@link AnalysisMessageController}. */
export type AnalysisMessageControllerContext = {
    delivery: IDeliveryService,
    resolver: IParticipantResolver,
    analyses: IAnalysisClientLookup,
    crypto: ICryptoService,
    hub: IHubClient
};

/**
 * Body of `POST /analyses/:id/messages`. `recipients` are participant **node ids**
 * (as returned by the participants endpoint); `message` is an opaque JSON payload the
 * broker seals and relays verbatim — the SDK round-trips its own `meta` envelope inside it.
 */
export type MessageSendBody = {
    recipients?: unknown,
    message?: unknown
};

/** Body of `POST /analyses/:id/messages/broadcast` — an opaque JSON payload, no recipients. */
export type MessageBroadcastBody = {
    message?: unknown
};

/** Body of the webhook-subscription endpoints. */
export type WebhookSubscriptionBody = {
    webhookUrl?: string
};
