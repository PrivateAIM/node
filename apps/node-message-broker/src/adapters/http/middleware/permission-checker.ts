/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { PermissionEvaluator } from '@authup/access';
import {
    RequestPermissionChecker,
    setRequestPermissionChecker,
    useRequestIdentity,
} from '@privateaim/server-http-kit';
import type { App } from 'routup';
import { defineCoreHandler } from 'routup';
import type { CallerIdentity, IPermissionCheckGateway } from '../../../core/authz/index.ts';
import { HttpPermissionProvider } from '../../authz/index.ts';

/**
 * Overrides the request permission checker so `useRequestPermissionChecker().check()`
 * evaluates against Authup over HTTP (via {@link HttpPermissionProvider}) instead of the
 * token's introspection permissions. Mount it **after** the authorization middleware
 * (which sets the verified identity) and **before** the controllers.
 */
export function mountPermissionChecker(app: App, gateway: IPermissionCheckGateway): void {
    app.use(defineCoreHandler((event) => {
        const identity = useRequestIdentity(event);
        if (identity) {
            const caller: CallerIdentity = {
                id: identity.id,
                type: identity.type,
                clientId: identity.type === 'client' ? identity.id : null,
                realmId: identity.realmId,
                realmName: identity.realmName,
            };

            const provider = new HttpPermissionProvider(gateway, caller);
            const evaluator = new PermissionEvaluator({
                provider,
                realmId: caller.realmId,
                clientId: caller.clientId,
            });

            setRequestPermissionChecker(event, new RequestPermissionChecker(event, evaluator));
        }

        return event.next();
    }));
}
