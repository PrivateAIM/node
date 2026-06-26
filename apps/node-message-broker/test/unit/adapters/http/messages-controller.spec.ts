/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ForbiddenError } from '@ebec/http';
import { PermissionName } from '@privateaim/kit';
import type { RequestIdentity } from '@privateaim/server-http-kit';
import type { IAppEvent } from 'routup';
import { describe, expect, it } from 'vitest';
import { AnalysisMessageController } from '../../../../src/adapters/http/controllers/messages/index.ts';
import type { AnalysisParticipant } from '../../../../src/core/analysis/index.ts';
import type { IDeliveryService } from '../../../../src/core/delivery/index.ts';
import { FakeAnalysisClientLookup } from '../../core/analysis/fake-analysis-client-lookup.ts';
import { FakeCryptoService } from '../../core/messaging/fake-crypto-service.ts';
import { FakeHubClient } from '../../core/messaging/fake-hub-client.ts';
import { FakeParticipantResolver } from '../../core/messaging/fake-participant-resolver.ts';

const SELF: AnalysisParticipant = {
    nodeId: 'node-self',
    nodeType: 'aggregator',
    clientId: 'client-self',
    publicKey: 'pk-self',
};
const NODE_B: AnalysisParticipant = {
    nodeId: 'node-b',
    nodeType: 'default',
    clientId: 'client-b',
    publicKey: 'pk-b',
};
const NODE_C: AnalysisParticipant = {
    nodeId: 'node-c',
    nodeType: 'default',
    clientId: 'client-c',
    publicKey: 'pk-c',
};

/** The analysis owner — `FakeAnalysisClientLookup` maps analysis `a1` to `client-analysis`. */
const OWNER: RequestIdentity = {
    id: 'client-analysis',
    type: 'client',
    realmId: 'realm-1',
    realmName: 'master',
};

const noopDelivery: IDeliveryService = {
    register: async () => {},
    unregister: async () => {},
    list: async () => [],
    deliver: async () => {},
};

function setup() {
    const resolver = new FakeParticipantResolver();
    const crypto = new FakeCryptoService();
    const hub = new FakeHubClient();
    const analyses = new FakeAnalysisClientLookup();

    resolver.participantsByAnalysis.set('a1', [SELF, NODE_B, NODE_C]);
    resolver.selfByAnalysis.set('a1', SELF);

    const controller = new AnalysisMessageController({
        delivery: noopDelivery,
        resolver,
        analyses,
        crypto,
        hub,
    });

    return {
        controller,
        resolver,
        crypto,
        hub,
        analyses,
    };
}

/**
 * Build a minimal request event — the permission checker and identity live on `store`
 * (where the `useRequest*` helpers read them), and `response.status` is what the
 * controller mutates. `check` defaults to an allow; pass a throwing one to simulate a
 * denied capability.
 */
function createEvent(options: {
    identity?: RequestIdentity,
    check?: (ctx: { name: string | string[] }) => Promise<void>,
} = {}): { event: IAppEvent, checks: { name: string | string[] }[] } {
    const checks: { name: string | string[] }[] = [];
    const check = options.check ?? (async () => {});

    const event = {
        store: {
            identity: options.identity ?? OWNER,
            permissionChecker: {
                check: async (ctx: { name: string | string[] }) => {
                    checks.push(ctx);
                    await check(ctx);
                },
            },
        },
        response: {
            status: 200,
            headers: new Headers(),
        },
    } as unknown as IAppEvent;

    return { event, checks };
}

describe('adapters/http/controllers/messages', () => {
    it('seals per recipient, relays one tagged Hub message each, and answers 202', async () => {
        const {
            controller, 
            crypto, 
            hub, 
        } = setup();
        const { event, checks } = createEvent();
        const message = { hello: 'world', meta: { id: 'm-1' } };

        const result = await controller.send('a1', { recipients: ['node-b', 'node-c'], message }, event);

        expect(result).toBeNull();
        expect(event.response.status).toBe(202);
        expect(checks).toEqual([{ name: PermissionName.ANALYSIS_SELF_MESSAGE_BROKER_USE }]);

        expect(hub.sends).toHaveLength(2);
        expect(crypto.sealCalls.map((call) => call.recipientPublicKey).sort()).toEqual(['pk-b', 'pk-c']);
        // the opaque JSON payload is serialized verbatim before sealing
        expect(crypto.sealCalls.every((call) => call.data === JSON.stringify(message))).toBe(true);

        const recipientClientIds = hub.sends.flatMap((send) => send.recipients.map((recipient) => recipient.id));
        expect(recipientClientIds.sort()).toEqual(['client-b', 'client-c']);
    });

    it('rejects a send when the capability is denied (and sends nothing)', async () => {
        const { controller, hub } = setup();
        const { event } = createEvent({
            check: async () => {
                throw new ForbiddenError('denied');
            },
        });

        await expect(controller.send('a1', { recipients: ['node-b'], message: { a: 1 } }, event))
            .rejects.toBeInstanceOf(ForbiddenError);
        expect(hub.sends).toEqual([]);
    });

    it('rejects a send when the caller does not own the analysis', async () => {
        const { controller, hub } = setup();
        const { event } = createEvent({
            identity: {
                id: 'client-other',
                type: 'client',
                realmId: 'realm-1',
                realmName: 'master',
            },
        });

        await expect(controller.send('a1', { recipients: ['node-b'], message: { a: 1 } }, event))
            .rejects.toBeInstanceOf(ForbiddenError);
        expect(hub.sends).toEqual([]);
    });

    it('rejects a send with empty or missing recipients', async () => {
        const { controller } = setup();

        await expect(controller.send('a1', { recipients: [], message: { a: 1 } }, createEvent().event))
            .rejects.toThrow(/recipients/i);
        await expect(controller.send('a1', { message: { a: 1 } }, createEvent().event))
            .rejects.toThrow(/recipients/i);
    });

    it('rejects a send without a message payload', async () => {
        const { controller } = setup();

        await expect(controller.send('a1', { recipients: ['node-b'] }, createEvent().event))
            .rejects.toThrow(/message/i);
    });

    it('broadcasts to every participant except self and answers 202', async () => {
        const { controller, hub } = setup();
        const { event } = createEvent();

        const result = await controller.broadcast('a1', { message: { ping: true } }, event);

        expect(result).toBeNull();
        expect(event.response.status).toBe(202);

        const recipientClientIds = hub.sends.flatMap((send) => send.recipients.map((recipient) => recipient.id));
        expect(recipientClientIds.sort()).toEqual(['client-b', 'client-c']);
    });

    it('lists participants as a bare array exposing only nodeId and nodeType', async () => {
        const { controller } = setup();

        const participants = await controller.listParticipants('a1', createEvent().event);

        expect(participants).toEqual([
            { nodeId: 'node-self', nodeType: 'aggregator' },
            { nodeId: 'node-b', nodeType: 'default' },
            { nodeId: 'node-c', nodeType: 'default' },
        ]);
        // the internal clientId / publicKey must never leak to containers
        expect(participants.every((participant) => !('clientId' in participant) && !('publicKey' in participant))).toBe(true);
    });

    it('returns the self participant', async () => {
        const { controller } = setup();

        const self = await controller.getSelfParticipant('a1', createEvent().event);

        expect(self).toEqual({ nodeId: 'node-self', nodeType: 'aggregator' });
    });

    it('404s when no self participant exists for the analysis', async () => {
        const { controller, resolver } = setup();
        resolver.selfByAnalysis.delete('a1');

        await expect(controller.getSelfParticipant('a1', createEvent().event))
            .rejects.toThrow(/self participant/i);
    });
});
