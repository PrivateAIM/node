/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { LRUCache } from 'lru-cache';
import type { CallerIdentity, IPermissionCheckGateway } from '../../core/authz/index.ts';

/** A few seconds — bounds Hub load without letting a revoked grant linger. */
const DEFAULT_TTL_MS = 5_000;

const DEFAULT_MAX = 1_024;

/** The slice of the Authup client this gateway uses — `POST /permissions/:id/check`. */
type PermissionCheckClient = {
    permission: {
        check(idOrName: string, data?: Record<string, unknown>): Promise<{ status: string }>
    }
};

type AuthupPermissionGatewayContext = {
    client: PermissionCheckClient,
    /** result cache TTL; `<= 0` disables caching. Defaults to {@link DEFAULT_TTL_MS}. */
    cacheTtlMs?: number,
    cacheMax?: number
};

/**
 * Resolves a named permission for a caller against Authup's
 * `POST /permissions/:id/check`, authenticated as the node client and passing the
 * **caller's** identity in the body (the endpoint lets a body identity override the
 * bearer). `status === 'success'` is a grant; anything else is a deny.
 *
 * Answers are cached briefly (shared across requests, keyed by permission + identity);
 * in-flight checks are coalesced and transient failures are not cached.
 */
export class AuthupPermissionGateway implements IPermissionCheckGateway {
    protected client: PermissionCheckClient;

    protected cache: LRUCache<string, Promise<boolean>> | undefined;

    constructor(ctx: AuthupPermissionGatewayContext) {
        this.client = ctx.client;
        const ttl = ctx.cacheTtlMs ?? DEFAULT_TTL_MS;
        const max = Math.max(1, ctx.cacheMax ?? DEFAULT_MAX);
        // ttl <= 0 disables caching outright (an LRUCache with no ttl would cache forever).
        this.cache = ttl > 0 ? new LRUCache<string, Promise<boolean>>({ max, ttl }) : undefined;
    }

    holds(permission: string, identity: CallerIdentity): Promise<boolean> {
        const { cache } = this;
        if (!cache) {
            return this.check(permission, identity);
        }

        const key = this.buildKey(permission, identity);

        const cached = cache.get(key);
        if (cached) {
            return cached;
        }

        const pending = this.check(permission, identity);
        cache.set(key, pending);
        // don't let a transient network/5xx failure stick in the cache
        pending.catch(() => {
            if (cache.peek(key) === pending) {
                cache.delete(key);
            }
        });

        return pending;
    }

    protected async check(permission: string, identity: CallerIdentity): Promise<boolean> {
        const response = await this.client.permission.check(permission, {
            identity: {
                type: identity.type,
                id: identity.id,
                clientId: identity.clientId ?? null,
                realmId: identity.realmId ?? null,
                realmName: identity.realmName ?? null,
            },
        });

        return response.status === 'success';
    }

    protected buildKey(permission: string, identity: CallerIdentity): string {
        return [permission, identity.type, identity.id, identity.realmId ?? '', identity.clientId ?? ''].join('|');
    }
}
