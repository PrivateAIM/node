/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { CallerIdentity } from '../../../../src/core/authz/index.ts';
import { AuthupPermissionGateway } from '../../../../src/adapters/authz/index.ts';
import { FakePermissionCheckClient } from './fake-permission-check-client.ts';

const IDENTITY: CallerIdentity = {
    id: 'client-analysis',
    type: 'client',
    clientId: 'client-analysis',
    realmId: 'realm-1',
    realmName: 'analysis',
};

describe('adapters/authz/authup-permission-gateway', () => {
    it('grants on status "success" and passes the caller identity in the body', async () => {
        const client = new FakePermissionCheckClient();
        const gateway = new AuthupPermissionGateway({ client });

        await expect(gateway.holds('analysis_self_message_broker_use', IDENTITY)).resolves.toBe(true);
        expect(client.calls).toHaveLength(1);
        expect(client.calls[0].idOrName).toBe('analysis_self_message_broker_use');
        expect(client.calls[0].data).toEqual({
            identity: {
                type: 'client',
                id: 'client-analysis',
                clientId: 'client-analysis',
                realmId: 'realm-1',
                realmName: 'analysis',
            },
        });
    });

    it('denies on any non-success status', async () => {
        const client = new FakePermissionCheckClient();
        client.status = 'error';
        const gateway = new AuthupPermissionGateway({ client });

        await expect(gateway.holds('analysis_self_message_broker_use', IDENTITY)).resolves.toBe(false);
    });

    it('caches the decision (a repeat check within TTL does not re-hit the client)', async () => {
        const client = new FakePermissionCheckClient();
        const gateway = new AuthupPermissionGateway({ client });

        await gateway.holds('p', IDENTITY);
        await gateway.holds('p', IDENTITY);

        expect(client.calls).toHaveLength(1);
    });

    it('keys the cache by permission + identity', async () => {
        const client = new FakePermissionCheckClient();
        const gateway = new AuthupPermissionGateway({ client });

        await gateway.holds('p', IDENTITY);
        await gateway.holds('q', IDENTITY);
        await gateway.holds('p', {
            ...IDENTITY, 
            id: 'other', 
            clientId: 'other', 
        });

        expect(client.calls).toHaveLength(3);
    });

    it('does not cache a transient failure (retries on the next check)', async () => {
        const client = new FakePermissionCheckClient();
        client.error = new Error('hub unreachable');
        const gateway = new AuthupPermissionGateway({ client });

        await expect(gateway.holds('p', IDENTITY)).rejects.toThrow(/hub unreachable/);

        client.error = undefined;
        await expect(gateway.holds('p', IDENTITY)).resolves.toBe(true);
        expect(client.calls).toHaveLength(2);
    });

    it('with caching disabled (ttl <= 0) hits the client every time', async () => {
        const client = new FakePermissionCheckClient();
        const gateway = new AuthupPermissionGateway({ client, cacheTtlMs: 0 });

        await gateway.holds('p', IDENTITY);
        await gateway.holds('p', IDENTITY);

        expect(client.calls).toHaveLength(2);
    });
});
