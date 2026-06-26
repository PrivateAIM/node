/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { CallerIdentity } from '../../../../src/core/authz/index.ts';
import { HttpPermissionProvider } from '../../../../src/adapters/authz/index.ts';
import { FakePermissionCheckGateway } from './fake-permission-gateway.ts';

const IDENTITY: CallerIdentity = {
    id: 'client-analysis',
    type: 'client',
    clientId: 'client-analysis',
    realmId: 'realm-1',
};

describe('adapters/authz/http-permission-provider', () => {
    it('returns a policy-less binding (grant) when the gateway grants', async () => {
        const gateway = new FakePermissionCheckGateway();
        const provider = new HttpPermissionProvider(gateway, IDENTITY);

        const binding = await provider.findOne({ name: 'analysis_self_message_broker_use' });

        expect(binding).toEqual({ permission: { name: 'analysis_self_message_broker_use' } });
        expect(gateway.calls).toEqual([{ permission: 'analysis_self_message_broker_use', identity: IDENTITY }]);
    });

    it('returns null (deny) when the gateway denies', async () => {
        const gateway = new FakePermissionCheckGateway();
        gateway.result = false;
        const provider = new HttpPermissionProvider(gateway, IDENTITY);

        const binding = await provider.findOne({ name: 'analysis_self_message_broker_use' });

        expect(binding).toBeNull();
    });

    it('propagates a gateway failure rather than denying', async () => {
        const gateway = new FakePermissionCheckGateway();
        gateway.error = new Error('hub unreachable');
        const provider = new HttpPermissionProvider(gateway, IDENTITY);

        await expect(provider.findOne({ name: 'analysis_self_message_broker_use' })).rejects.toThrow(/hub unreachable/);
    });
});
