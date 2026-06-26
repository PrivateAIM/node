/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Logger } from '@privateaim/server-kit';
import type { IParticipantResolver } from '../analysis/index.ts';
import type { ICryptoService } from '../crypto/index.ts';
import type { IDeliveryService } from '../delivery/index.ts';
import type { IHubClient } from '../hub/index.ts';

/** The ports the inbound delivery loop fans in from. */
export type InboundDeliveryDeps = {
    hub: IHubClient,
    crypto: ICryptoService,
    resolver: IParticipantResolver,
    delivery: IDeliveryService,
    logger?: Logger
};

/** Tunables for the inbound delivery loop. */
export type InboundProcessorOptions = {
    /** maximum messages requested per pull (default 50) */
    pullLimit?: number,
    /** long-poll budget in ms for the fallback loop's pull (default 20000) */
    waitMs?: number,
    /** backoff in ms after a failed pull before the fallback loop retries (default 1000) */
    errorBackoffMs?: number
};
