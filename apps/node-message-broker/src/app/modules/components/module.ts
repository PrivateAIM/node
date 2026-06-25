/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { Client } from '@privateaim/messenger-http-kit';
import {
    EnvironmentName,
    LoggerInjectionKey,
    createAuthupClientAuthenticationHook,
    createAuthupClientTokenCreator,
} from '@privateaim/server-kit';
import { MemoryDeliveryService } from '../../../adapters/delivery/index.ts';
import { HubClient, SseWakeupSource } from '../../../adapters/hub/index.ts';
import { ConfigInjectionKey } from '../config/constants.ts';
import { ComponentsInjectionKey } from './constants.ts';

/**
 * Wires the broker's moving parts: local delivery (webhook registry) and the
 * Hub link — REST send/pull/ack via `@privateaim/messenger-http-kit` plus the
 * SSE wakeup stream, both authenticated as the node client via client
 * credentials.
 *
 * Phase 4 (Plan 013 Track B): the `onWakeup` → pull → decrypt → `delivery.deliver()`
 * loop still needs the crypto adapter before it can be connected here.
 */
export class ComponentsModule implements IModule {
    readonly name = 'components';

    readonly dependencies: string[] = ['config'];

    private hubClient: HubClient | undefined;

    private authHook: ReturnType<typeof createAuthupClientAuthenticationHook> | undefined;

    async setup(container: IContainer): Promise<void> {
        const config = container.resolve(ConfigInjectionKey);

        const loggerResult = container.tryResolve(LoggerInjectionKey);
        const logger = loggerResult.success ? loggerResult.data : undefined;

        const delivery = new MemoryDeliveryService();
        container.register(ComponentsInjectionKey.Delivery, { useValue: delivery });

        // node-client credentials authenticate every Hub interaction; this creator
        // backs the REST auth hook directly and the SSE Authorization header via a
        // caching wrapper (below).
        const tokenCreator = createAuthupClientTokenCreator({
            baseURL: config.authupURL,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            realm: config.realm,
        });

        const client = new Client({ baseURL: config.hubURL });
        const authHook = createAuthupClientAuthenticationHook({
            baseURL: config.authupURL,
            tokenCreator,
        });
        authHook.attach(client);
        this.authHook = authHook;

        // The SSE stream reads over raw `fetch`, so it can't piggyback on the REST
        // hook's cached token; cache the node-client grant ourselves so reconnects
        // reuse it instead of minting a fresh grant per (re)connect.
        const wakeupTokenCreator = createCachedTokenCreator(tokenCreator);

        // `new URL(relative, base)` drops the last path segment of a base without a
        // trailing slash — guard so a sub-pathed HUB_URL still resolves correctly.
        const hubBaseURL = config.hubURL.endsWith('/') ? config.hubURL : `${config.hubURL}/`;

        const wakeup = new SseWakeupSource({
            url: new URL('messages/stream', hubBaseURL).toString(),
            authorization: async () => `Bearer ${(await wakeupTokenCreator()).access_token}`,
            logger,
        });

        const hubClient = new HubClient({ client, wakeup });
        container.register(ComponentsInjectionKey.HubClient, { useValue: hubClient });

        // tests don't reach a live Hub; skip opening the reconnecting stream.
        if (config.env !== EnvironmentName.TEST) {
            await hubClient.start();
        }

        this.hubClient = hubClient;
    }

    async teardown(): Promise<void> {
        if (this.hubClient) {
            await this.hubClient.stop();
            this.hubClient = undefined;
        }

        // The auth hook owns a token-refresh timer; drop it so it can't fire (and
        // hit Authup) after shutdown.
        if (this.authHook) {
            this.authHook.disable();
            this.authHook.clearTimer();
            this.authHook = undefined;
        }
    }
}

/**
 * Wrap a {@link createAuthupClientTokenCreator} result so the grant is reused
 * until shortly before it expires, instead of minting a fresh one on every call.
 * Calls are serial (the SSE source reconnects one at a time), so no in-flight
 * de-duplication is needed.
 */
function createCachedTokenCreator(
    inner: ReturnType<typeof createAuthupClientTokenCreator>,
): ReturnType<typeof createAuthupClientTokenCreator> {
    const EXPIRY_MARGIN_SECONDS = 30;

    let cached: Awaited<ReturnType<typeof inner>> | undefined;
    let expiresAt = 0;

    return async () => {
        const now = Date.now();
        if (cached && now < expiresAt) {
            return cached;
        }

        const grant = await inner();
        cached = grant;
        expiresAt = now + Math.max(0, grant.expires_in - EXPIRY_MARGIN_SECONDS) * 1000;
        return grant;
    };
}
