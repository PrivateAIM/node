/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EnvironmentName } from '@privateaim/server-kit';
import { EnvironmentInputKey } from './constants.ts';
import type { Config } from './types.ts';

/**
 * Env vars that must be set explicitly in production. The broker ships development defaults
 * for the whole security stack — localhost Authup, `system` / `start123` node-client
 * credentials, and no node key — so relying on them in production would silently
 * authenticate against the wrong identity provider (or, with an unreachable default Authup,
 * degrade `mountAuthorizationMiddleware` to its fake-identity mode) and have no usable
 * end-to-end key.
 */
const PRODUCTION_REQUIRED_ENV: EnvironmentInputKey[] = [
    EnvironmentInputKey.AUTHUP_URL,
    EnvironmentInputKey.CLIENT_ID,
    EnvironmentInputKey.CLIENT_SECRET,
    EnvironmentInputKey.REALM,
    EnvironmentInputKey.NODE_PRIVATE_KEY,
];

/**
 * Fail fast when the broker is started in **production** without the security stack
 * explicitly configured, rather than silently running with development defaults. Outside
 * production (development / test) the defaults are intended, so the guard is a no-op.
 *
 * Checks raw env presence (not the normalized config) so a value left at its dev default
 * is treated as unset.
 */
export function assertProductionConfig(
    config: Pick<Config, 'env'>,
    env: Record<string, string | undefined> = process.env,
): void {
    if (config.env !== EnvironmentName.PRODUCTION) {
        return;
    }

    const missing = PRODUCTION_REQUIRED_ENV.filter((key) => {
        const value = env[key];
        return value === undefined || value === '';
    });

    if (missing.length > 0) {
        throw new Error(
            `Refusing to start in production with an unconfigured security stack: set ${missing.join(', ')}. ` +
            'Development defaults must not be relied on in production.',
        );
    }
}
