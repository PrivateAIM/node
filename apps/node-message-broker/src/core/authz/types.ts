/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * The caller subset a permission check needs, taken from the verified request identity
 * (`useRequestIdentity`). Mirrors Authup's `IdentityPolicyData` so it can ride in the
 * `/permissions/:id/check` body.
 */
export type CallerIdentity = {
    id: string,
    /** `user` | `client` | `robot` */
    type: string,
    clientId?: string | null,
    realmId?: string | null,
    realmName?: string | null
};

/**
 * Asks Authup whether a caller holds a named permission. Narrow port so the HTTP
 * permission provider is testable with a fake; the live implementation wraps the Authup
 * client's `permission.check` (`POST /permissions/:name/check`, caller identity in the
 * body) and caches the answer for a few seconds.
 */
export interface IPermissionCheckGateway {
    holds(permission: string, identity: CallerIdentity): Promise<boolean>;
}
