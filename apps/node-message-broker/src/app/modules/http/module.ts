/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IContainer } from 'eldin';
import type { IModule, ModuleDependency } from 'orkos';
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
    mountDecoratorsMiddleware,
    mountErrorMiddleware,
    mountMiddlewares,
} from '@privateaim/server-http-kit';
import { AuthupPermissionGateway } from '../../../adapters/authz/index.ts';
import { mountPermissionChecker } from '../../../adapters/http/middleware/permission-checker.ts';
import { ConfigInjectionKey } from '../config/constants.ts';
import { createControllers } from './controller.ts';
import type { HTTPServer } from './constants.ts';
import { HTTPInjectionKey } from './constants.ts';

export class HTTPModule implements IModule {
    readonly name = 'http';

    // `components` + `coreClient` register the ports the controllers resolve (delivery,
    // crypto, hub, participant resolver, analysis lookup). `authupClient` is optional so
    // partial builds (e.g. tests) still work; when present it must set up before HTTP so
    // the authorization middleware + permission checker run.
    readonly dependencies: (string | ModuleDependency)[] = ['config', 'components', 'coreClient', { name: 'authupClient', optional: true }];

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

        // controllers are mounted separately (below) so the permission-checker override
        // can sit between the authorization middleware and the controllers.
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
        });

        // Override the request permission checker so capabilities evaluate against Authup
        // over HTTP. Skipped in tests, where the authorization middleware's dry-run grant
        // applies and no Authup client is reachable.
        if (authupResult.success && !isTestEnvironment) {
            const gateway = new AuthupPermissionGateway({ client: authupResult.data });
            mountPermissionChecker(app, gateway);
        }

        mountDecoratorsMiddleware(app, { controllers });

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
