/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { MemoryDeliveryService } from '../../../adapters/delivery/index.ts';
import { HubClient } from '../../../adapters/hub/index.ts';
import { ComponentsInjectionKey } from './constants.ts';

/**
 * Wires the broker's moving parts: local delivery (webhook registry) and the
 * Hub link. Phase 4 connects the Hub client's `onWakeup` → pull → decrypt →
 * `delivery.deliver()` loop; today it registers the ports with a stub client.
 */
export class ComponentsModule implements IModule {
    readonly name = 'components';

    readonly dependencies: string[] = ['config'];

    private hubClient: HubClient | undefined;

    async setup(container: IContainer): Promise<void> {
        const delivery = new MemoryDeliveryService();
        container.register(ComponentsInjectionKey.Delivery, { useValue: delivery });

        // Phase 4 (Plan 013 Track B): construct the real Hub client from config
        // (@privateaim/messenger-http-kit + the SSE wakeup stream) and wire
        // onWakeup → pull → decrypt → delivery.deliver().
        const hubClient = new HubClient();
        await hubClient.start();
        this.hubClient = hubClient;
        container.register(ComponentsInjectionKey.HubClient, { useValue: hubClient });
    }

    async teardown(): Promise<void> {
        if (this.hubClient) {
            await this.hubClient.stop();
            this.hubClient = undefined;
        }
    }
}
