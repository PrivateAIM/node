/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { CallerIdentity, IPermissionCheckGateway } from '../../../../src/core/authz/index.ts';

/**
 * In-memory `IPermissionCheckGateway` that records every lookup and returns a
 * configurable grant decision (or throws) — stands in for the HTTP capability check so
 * the permission provider is testable without a live Authup server.
 */
export class FakePermissionCheckGateway implements IPermissionCheckGateway {
    calls: { permission: string, identity: CallerIdentity }[] = [];

    result = true;

    /** When set, the next `holds` rejects with this error. */
    error: Error | undefined;

    holds = async (permission: string, identity: CallerIdentity): Promise<boolean> => {
        this.calls.push({ permission, identity });
        if (this.error) {
            throw this.error;
        }
        return this.result;
    };
}
