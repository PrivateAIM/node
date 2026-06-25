/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { Client } from '@privateaim/core-http-kit';
import {
    LoggerInjectionKey,
    createAuthupClientAuthenticationHook,
    createAuthupClientTokenCreator,
} from '@privateaim/server-kit';
import type { IAnalysisNodeProvider } from '../../../core/analysis/index.ts';
import { ParticipantResolver } from '../../../adapters/core/index.ts';
import { ConfigInjectionKey } from '../config/constants.ts';
import { CoreClientInjectionKey } from './constants.ts';

/**
 * Wires the server-core link: a `@privateaim/core-http-kit` client (authenticated
 * as the node client via client credentials, mirroring the Hub link) backing the
 * {@link ParticipantResolver}. Registered for the analysis policy (S3) and the
 * send/deliver flows (S5/S6) to consume.
 */
export class CoreClientModule implements IModule {
    readonly name = 'coreClient';

    readonly dependencies: string[] = ['config'];

    private authHook: ReturnType<typeof createAuthupClientAuthenticationHook> | undefined;

    async setup(container: IContainer): Promise<void> {
        const config = container.resolve(ConfigInjectionKey);

        const loggerResult = container.tryResolve(LoggerInjectionKey);
        const logger = loggerResult.success ? loggerResult.data : undefined;

        const tokenCreator = createAuthupClientTokenCreator({
            baseURL: config.authupURL,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            realm: config.realm,
        });

        const client = new Client({ baseURL: config.coreURL });
        const authHook = createAuthupClientAuthenticationHook({
            baseURL: config.authupURL,
            tokenCreator,
        });
        authHook.attach(client);
        this.authHook = authHook;

        // wrap the core client's analysis-node lookup behind the narrow provider port
        const provider: IAnalysisNodeProvider = {
            list: async (analysisId) => {
                const response = await client.analysisNode.getMany({
                    filter: { analysis_id: analysisId },
                    include: ['node'],
                });
                return response.data.map((entry) => entry.node);
            },
        };

        const resolver = new ParticipantResolver({
            provider,
            selfClientId: config.clientId,
            logger,
        });
        container.register(CoreClientInjectionKey.ParticipantResolver, { useValue: resolver });
    }

    async teardown(): Promise<void> {
        // The auth hook owns a token-refresh timer; drop it so it can't fire (and
        // hit Authup) after shutdown.
        if (this.authHook) {
            this.authHook.disable();
            this.authHook.clearTimer();
            this.authHook = undefined;
        }
    }
}
