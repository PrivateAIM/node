/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IPermissionProvider, PermissionGetOptions, PermissionPolicyBinding } from '@authup/access';
import type { CallerIdentity, IPermissionCheckGateway } from '../../core/authz/index.ts';

/**
 * An `@authup/access` {@link IPermissionProvider} backed by an HTTP capability check.
 * Built per request around the caller's identity; `findOne` delegates the decision to
 * the Hub via the {@link IPermissionCheckGateway} and returns a **policy-less** binding
 * (an unconditional grant once the engine evaluates it) on success, or `null` (deny).
 *
 * This plugs the engine's one extension seam so `useRequestPermissionChecker().check()`
 * evaluates against Authup over HTTP instead of the token's (soon-removed) introspection
 * permissions.
 */
export class HttpPermissionProvider implements IPermissionProvider {
    protected gateway: IPermissionCheckGateway;

    protected identity: CallerIdentity;

    constructor(gateway: IPermissionCheckGateway, identity: CallerIdentity) {
        this.gateway = gateway;
        this.identity = identity;
    }

    async findOne(criteria: PermissionGetOptions): Promise<PermissionPolicyBinding | null> {
        const granted = await this.gateway.holds(criteria.name, this.identity);
        if (!granted) {
            return null;
        }

        return { permission: { name: criteria.name } };
    }
}
