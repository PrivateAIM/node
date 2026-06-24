/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { App, defineCoreHandler, serve } from 'routup';
import {
    AuthupClientInjectionKey,
    EnvironmentName,
    LoggerInjectionKey,
    RedisClientInjectionKey,
    createAuthupClientTokenCreator,
} from '@privateaim/server-kit';
import {
    createAuthupTokenVerifier,
    mountErrorMiddleware,
    mountMiddlewares,
} from '@privateaim/server-http-kit';
import { ConfigInjectionKey } from '../config/constants.ts';
import { createControllers } from './controller.ts';
import type { HTTPServer } from './constants.ts';
import { HTTPInjectionKey } from './constants.ts';

export class HTTPModule implements IModule {
    readonly name = 'http';

    readonly dependencies: string[] = ['config', 'components'];

    private instance: HTTPServer | undefined;

    async setup(container: IContainer): Promise<void> {
        const config = container.resolve(ConfigInjectionKey);
        const logger = container.resolve(LoggerInjectionKey);

        const app = new App();

        const isTestEnvironment = config.env === EnvironmentName.TEST;

        // liveness — registered before the auth middlewares so it stays unauthenticated
        app.get('/healthz', defineCoreHandler(() => ({ timestamp: Date.now() })));

        const controllers = createControllers(container);

        const authupResult = container.tryResolve(AuthupClientInjectionKey);
        const redisResult = container.tryResolve(RedisClientInjectionKey);

        mountMiddlewares(app, {
            basic: true,
            cors: true,
            prometheus: !isTestEnvironment,
            rateLimit: !isTestEnvironment,
            authorization: {
                authupClient: authupResult.success ? authupResult.data : undefined,
                redisClient: redisResult.success ? redisResult.data : undefined,
                dryRun: isTestEnvironment,
                tokenVerifier: createAuthupTokenVerifier({
                    baseURL: config.authupURL,
                    creator: createAuthupClientTokenCreator({
                        baseURL: config.authupURL,
                        clientId: config.clientId,
                        clientSecret: config.clientSecret,
                        realm: config.realm,
                    }),
                    redisClient: redisResult.success ? redisResult.data : undefined,
                }),
            },
            swagger: false,
            decorators: { controllers },
        });

        mountErrorMiddleware(app, { logger });

        logger.debug('Starting http server...');

        const server = serve(app, {
            port: config.port,
            hostname: '0.0.0.0',
            silent: true,
            gracefulShutdown: false,
        });

        await server.ready();

        this.instance = server;

        if (server.url) {
            logger.debug(`Listening on ${server.url}`);
        }

        container.register(HTTPInjectionKey.Server, { useValue: server });
    }

    async teardown(container: IContainer): Promise<void> {
        if (!this.instance) {
            return;
        }

        container.unregister(HTTPInjectionKey.Server);

        await this.instance.close();
        this.instance = undefined;
    }
}
