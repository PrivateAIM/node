/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Application } from 'orkos';
import { LoggerConsoleTransport } from '@privateaim/server-kit';
import { ServerMessageBrokerApplicationBuilder } from './builder.ts';

export function createApplication(): Application {
    const builder = new ServerMessageBrokerApplicationBuilder()
        .withConfig()
        .withLogger({
            transports: [
                new LoggerConsoleTransport(),
            ],
        })
        .withComponents()
        .withCoreClient()
        .withAuthupHook()
        .withAuthupClient()
        .withHTTP();

    return builder.build();
}
