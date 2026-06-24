/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EnvironmentName } from '@privateaim/server-kit';
import { read, readInt } from 'envix';
import { ConfigDefaults, EnvironmentInputKey } from './constants.ts';
import type { Config } from './types.ts';

export function readConfigFromEnv(): Partial<Config> {
    return {
        env: read(EnvironmentInputKey.ENV, EnvironmentName.DEVELOPMENT) as `${EnvironmentName}`,
        port: readInt(EnvironmentInputKey.PORT, ConfigDefaults.PORT),

        clientId: read(EnvironmentInputKey.CLIENT_ID, ConfigDefaults.CLIENT_ID),
        clientSecret: read(EnvironmentInputKey.CLIENT_SECRET, ConfigDefaults.CLIENT_SECRET),
        realm: read(EnvironmentInputKey.REALM, ConfigDefaults.REALM),

        authupURL: read(EnvironmentInputKey.AUTHUP_URL, ConfigDefaults.AUTHUP_URL),
        hubURL: read(EnvironmentInputKey.HUB_URL, ConfigDefaults.HUB_URL),
        coreURL: read(EnvironmentInputKey.CORE_URL, ConfigDefaults.CORE_URL),

        nodePrivateKey: read(EnvironmentInputKey.NODE_PRIVATE_KEY),
    };
}
