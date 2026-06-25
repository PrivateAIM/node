/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

type CheckCall = { idOrName: string, data?: Record<string, unknown> };

/**
 * In-memory stand-in for the Authup client's `permission.check` — records every call
 * and returns a configurable status (or throws), so the gateway is testable without a
 * live Authup server. Structurally satisfies the gateway's `PermissionCheckClient`.
 */
export class FakePermissionCheckClient {
    calls: CheckCall[] = [];

    status: 'success' | 'error' = 'success';

    /** When set, the next `check` rejects with this error. */
    error: Error | undefined;

    permission = {
        check: async (idOrName: string, data?: Record<string, unknown>): Promise<{ status: string }> => {
            this.calls.push({ idOrName, data });
            if (this.error) {
                throw this.error;
            }
            return { status: this.status };
        },
    };
}
