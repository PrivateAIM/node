/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { BaseServerConfig } from '@privateaim/server-kit';

export interface Config extends BaseServerConfig {
    /** Node-local Authup identity provider URL (verifies inbound container JWTs). */
    authupURL: string;

    /** Hub message-broker base URL — the durable mailbox this node relays to. */
    hubURL: string;

    /** server-core base URL — participant resolution + per-analysis client credentials. */
    coreURL: string;

    /** Operator-held node private key (hex-encoded PEM/SPKI) for node-to-node E2E crypto. */
    nodePrivateKey?: string;
}
