/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { SendMessageRequest } from '@privateaim/messenger-kit';
import { describe, expect, it } from 'vitest';
import type { AnalysisParticipant } from '../../../../src/core/analysis/index.ts';
import { broadcastAnalysisMessage, dispatchAnalysisMessage } from '../../../../src/core/messaging/index.ts';
import { FakeCryptoService } from './fake-crypto-service.ts';
import { FakeHubClient } from './fake-hub-client.ts';
import { FakeParticipantResolver } from './fake-participant-resolver.ts';

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

function setup() {
    const resolver = new FakeParticipantResolver();
    const crypto = new FakeCryptoService();
    const hub = new FakeHubClient();

    resolver.participantsByAnalysis.set('a1', [SELF, NODE_B, NODE_C]);
    resolver.selfByAnalysis.set('a1', SELF);

    return {
        resolver,
        crypto,
        hub,
        deps: {
            resolver, 
            crypto, 
            hub, 
        },
    };
}

/** Index sends by their single recipient's client id for order-independent assertions. */
function byRecipientClient(sends: SendMessageRequest[]): Map<string, SendMessageRequest> {
    return new Map(sends.map((send) => [send.recipients[0].id, send]));
}

describe('core/messaging/dispatch', () => {
    it('seals per recipient and relays one Hub message each, tagged with the analysis', async () => {
        const {
            crypto, 
            hub, 
            deps, 
        } = setup();

        const ids = await dispatchAnalysisMessage(deps, {
            analysisId: 'a1',
            recipientNodeIds: ['node-b', 'node-c'],
            data: 'hello',
        });

        expect(ids).toHaveLength(2);
        expect(hub.sends).toHaveLength(2);
        expect(crypto.sealCalls.map((call) => call.recipientPublicKey).sort()).toEqual(['pk-b', 'pk-c']);

        const sends = byRecipientClient(hub.sends);
        expect(sends.get('client-b')).toMatchObject({
            recipients: [{ type: 'client', id: 'client-b' }],
            data: 'sealed:pk-b',
            metadata: { analysisId: 'a1' },
        });
        expect(sends.get('client-c')?.data).toBe('sealed:pk-c');
    });

    it('rejects an unknown recipient node', async () => {
        const { hub, deps } = setup();

        await expect(dispatchAnalysisMessage(deps, {
            analysisId: 'a1', 
            recipientNodeIds: ['node-x'], 
            data: 'x', 
        }))
            .rejects.toThrow(/not a participant/i);
        expect(hub.sends).toEqual([]);
    });

    it('broadcasts to every participant except self', async () => {
        const { hub, deps } = setup();

        const ids = await broadcastAnalysisMessage(deps, { analysisId: 'a1', data: 'hi' });

        expect(ids).toHaveLength(2);
        const recipientClientIds = hub.sends.flatMap((send) => send.recipients.map((recipient) => recipient.id));
        expect(recipientClientIds.sort()).toEqual(['client-b', 'client-c']);
    });

    it('sends nothing when there are no recipients', async () => {
        const { hub, deps } = setup();

        const ids = await dispatchAnalysisMessage(deps, {
            analysisId: 'a1', 
            recipientNodeIds: [], 
            data: 'x', 
        });

        expect(ids).toEqual([]);
        expect(hub.sends).toEqual([]);
    });
});
