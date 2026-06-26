/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BaseApplicationBuilder } from '@privateaim/server-kit';
import type { IModule } from 'orkos';
import { ConfigModule } from './modules/config/index.ts';
import { ComponentsModule } from './modules/components/index.ts';
import { CoreClientModule } from './modules/core-client/index.ts';
import { HTTPModule } from './modules/http/index.ts';
import { InboundModule } from './modules/inbound/index.ts';

export class ServerMessageBrokerApplicationBuilder extends BaseApplicationBuilder {
    withConfig(instance?: ConfigModule | false): this {
        return this.addModuleSlot('config', instance, () => new ConfigModule());
    }

    withComponents(instance?: ComponentsModule | false): this {
        return this.addModuleSlot('components', instance, () => new ComponentsModule());
    }

    withCoreClient(instance?: CoreClientModule | false): this {
        return this.addModuleSlot('coreClient', instance, () => new CoreClientModule());
    }

    withInbound(instance?: InboundModule | false): this {
        return this.addModuleSlot('inbound', instance, () => new InboundModule());
    }

    withHTTP(instance?: HTTPModule | false): this {
        return this.addModuleSlot('http', instance, () => new HTTPModule());
    }

    private addModuleSlot(name: string, instance: IModule | false | undefined, factory: () => IModule): this {
        if (instance === false) {
            return this;
        }

        this.modules.push(instance ?? factory());
        return this;
    }
}
