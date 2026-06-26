/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { EnvironmentName, LoggerInjectionKey } from '@privateaim/server-kit';
import { InboundDeliveryProcessor } from '../../../core/inbound/index.ts';
import { ComponentsInjectionKey } from '../components/constants.ts';
import { ConfigInjectionKey } from '../config/constants.ts';
import { CoreClientInjectionKey } from '../core-client/constants.ts';

/**
 * Starts the inbound delivery loop (Plan 013 Track B, Phase 4): wakeup/long-poll → pull →
 * decrypt → fan out to the analysis webhooks. Depends on `components` (Hub link, crypto,
 * delivery) and `coreClient` (participant resolver, for the sender's node key). The loop is
 * skipped under the test environment, mirroring how the Hub stream is left unopened there.
 */
export class InboundModule implements IModule {
    readonly name = 'inbound';

    readonly dependencies: string[] = ['config', 'components', 'coreClient'];

    private processor: InboundDeliveryProcessor | undefined;

    async setup(container: IContainer): Promise<void> {
        const config = container.resolve(ConfigInjectionKey);

        const loggerResult = container.tryResolve(LoggerInjectionKey);
        const logger = loggerResult.success ? loggerResult.data : undefined;

        const processor = new InboundDeliveryProcessor({
            hub: container.resolve(ComponentsInjectionKey.HubClient),
            crypto: container.resolve(ComponentsInjectionKey.Crypto),
            delivery: container.resolve(ComponentsInjectionKey.Delivery),
            resolver: container.resolve(CoreClientInjectionKey.ParticipantResolver),
            logger,
        });

        // tests don't reach a live Hub; skip pulling and the reconnecting wakeup stream.
        if (config.env !== EnvironmentName.TEST) {
            processor.start();
        }

        this.processor = processor;
    }

    async teardown(): Promise<void> {
        if (this.processor) {
            await this.processor.stop();
            this.processor = undefined;
        }
    }
}
