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

    async setup(container: IContainer): Promise<void> {
        const config = container.resolve(ConfigInjectionKey);

        const loggerResult = container.tryResolve(LoggerInjectionKey);
        const logger = loggerResult.success ? loggerResult.data : undefined;

        const delivery = new MemoryDeliveryService();
        container.register(ComponentsInjectionKey.Delivery, { useValue: delivery });

        // node-client credentials authenticate every Hub interaction; the same
        // token creator backs the REST auth hook and the SSE Authorization header.
        const tokenCreator = createAuthupClientTokenCreator({
            baseURL: config.authupURL,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            realm: config.realm,
        });

        const client = new Client({ baseURL: config.hubURL });
        createAuthupClientAuthenticationHook({
            baseURL: config.authupURL,
            tokenCreator,
        }).attach(client);

        const wakeup = new SseWakeupSource({
            url: new URL('messages/stream', config.hubURL).toString(),
            authorization: async () => `Bearer ${(await tokenCreator()).access_token}`,
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
    }
}
