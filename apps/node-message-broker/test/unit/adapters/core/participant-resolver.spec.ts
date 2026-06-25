/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { CoreNode } from '../../../../src/core/analysis/index.ts';
import { ParticipantResolver } from '../../../../src/adapters/core/index.ts';
import { FakeAnalysisNodeProvider } from './fake-analysis-node-provider.ts';

const SELF_CLIENT_ID = 'client-self';

function node(over: Partial<CoreNode> = {}): CoreNode {
    return {
        id: 'node-1',
        type: 'default',
        client_id: 'client-1',
        public_key: 'pubkey-1',
        ...over,
    };
}

function setup() {
    const provider = new FakeAnalysisNodeProvider();
    const resolver = new ParticipantResolver({ provider, selfClientId: SELF_CLIENT_ID });
    return {
        provider,
        resolver,
    };
}

describe('adapters/core/participant-resolver', () => {
    it('resolves participants and maps the node fields', async () => {
        const { provider, resolver } = setup();
        provider.nodesByAnalysis.set('a1', [
            node({
                id: 'n1', 
                type: 'default', 
                client_id: 'c1', 
                public_key: 'pk1', 
            }),
            node({
                id: 'n2', 
                type: 'aggregator', 
                client_id: 'c2', 
                public_key: 'pk2', 
            }),
        ]);

        const participants = await resolver.resolve('a1');

        expect(participants).toEqual([
            {
                nodeId: 'n1', 
                nodeType: 'default', 
                clientId: 'c1', 
                publicKey: 'pk1', 
            },
            {
                nodeId: 'n2', 
                nodeType: 'aggregator', 
                clientId: 'c2', 
                publicKey: 'pk2', 
            },
        ]);
        expect(provider.calls).toEqual(['a1']);
    });

    it('skips participants missing a client id or public key', async () => {
        const { provider, resolver } = setup();
        provider.nodesByAnalysis.set('a1', [
            node({
                id: 'ok', 
                client_id: 'c-ok', 
                public_key: 'pk-ok', 
            }),
            node({
                id: 'no-client', 
                client_id: null, 
                public_key: 'pk', 
            }),
            node({
                id: 'no-key', 
                client_id: 'c', 
                public_key: null, 
            }),
        ]);

        const participants = await resolver.resolve('a1');

        expect(participants.map((p) => p.nodeId)).toEqual(['ok']);
    });

    it('resolveSelf returns the participant matching this node client id', async () => {
        const { provider, resolver } = setup();
        provider.nodesByAnalysis.set('a1', [
            node({
                id: 'other', 
                client_id: 'c-other', 
                public_key: 'pk', 
            }),
            node({
                id: 'self', 
                client_id: SELF_CLIENT_ID, 
                public_key: 'pk-self', 
            }),
        ]);

        const self = await resolver.resolveSelf('a1');

        expect(self).toEqual({
            nodeId: 'self', 
            nodeType: 'default', 
            clientId: SELF_CLIENT_ID, 
            publicKey: 'pk-self', 
        });
    });

    it('resolveSelf returns undefined when this node is not a participant', async () => {
        const { provider, resolver } = setup();
        provider.nodesByAnalysis.set('a1', [node({
            id: 'other', 
            client_id: 'c-other', 
            public_key: 'pk', 
        })]);

        expect(await resolver.resolveSelf('a1')).toBeUndefined();
    });

    it('returns an empty list for an unknown analysis', async () => {
        const { resolver } = setup();

        expect(await resolver.resolve('unknown')).toEqual([]);
        expect(await resolver.resolveSelf('unknown')).toBeUndefined();
    });

    it('caches resolution per analysis within the ttl', async () => {
        const { provider, resolver } = setup();
        provider.nodesByAnalysis.set('a1', [node()]);

        await resolver.resolve('a1');
        await resolver.resolve('a1');

        expect(provider.calls).toEqual(['a1']);
    });

    it('does not cache a failed resolution', async () => {
        const { provider, resolver } = setup();
        provider.error = new Error('core unavailable');

        await expect(resolver.resolve('a1')).rejects.toThrow('core unavailable');

        provider.error = undefined;
        provider.nodesByAnalysis.set('a1', [node({
            id: 'n1', 
            client_id: 'c1', 
            public_key: 'pk1', 
        })]);

        const participants = await resolver.resolve('a1');

        expect(participants.map((p) => p.nodeId)).toEqual(['n1']);
        expect(provider.calls).toEqual(['a1', 'a1']);
    });

    it('does not cache when caching is disabled', async () => {
        const provider = new FakeAnalysisNodeProvider();
        const resolver = new ParticipantResolver({
            provider, 
            selfClientId: SELF_CLIENT_ID, 
            cacheTtlMs: 0, 
        });
        provider.nodesByAnalysis.set('a1', [node()]);

        await resolver.resolve('a1');
        await resolver.resolve('a1');

        expect(provider.calls).toEqual(['a1', 'a1']);
    });
});
