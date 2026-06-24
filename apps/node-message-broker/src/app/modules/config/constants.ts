/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { TypedToken } from 'eldin';
import { ConfigInjectionKey as BaseConfigInjectionKey } from '@privateaim/server-kit';
import type { Config } from './types.ts';

export const ConfigInjectionKey = BaseConfigInjectionKey as unknown as TypedToken<Config>;

export const ConfigDefaults = {
    PORT: 3000,

    REALM: 'master',

    CLIENT_ID: 'system',
    CLIENT_SECRET: 'start123',

    AUTHUP_URL: 'http://127.0.0.1:3010/',
    HUB_URL: 'http://127.0.0.1:3000/',
    CORE_URL: 'http://127.0.0.1:3001/',
} as const;

export enum EnvironmentInputKey {
    ENV = 'NODE_ENV',
    PORT = 'PORT',

    CLIENT_ID = 'CLIENT_ID',
    CLIENT_SECRET = 'CLIENT_SECRET',

    REALM = 'REALM',

    AUTHUP_URL = 'AUTHUP_URL',
    HUB_URL = 'HUB_URL',
    CORE_URL = 'CORE_URL',

    // PEM/SPKI (hex-encoded) private key for node-to-node E2E crypto; operator-held.
    NODE_PRIVATE_KEY = 'NODE_PRIVATE_KEY',
}
