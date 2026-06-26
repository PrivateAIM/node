/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Message } from '@privateaim/messenger-kit';
import { 
    describe, 
    expect, 
    it, 
    vi, 
} from 'vitest';
import type { AnalysisParticipant } from '../../../../src/core/analysis/index.ts';
import { InboundDeliveryProcessor } from '../../../../src/core/inbound/index.ts';
import { FakeParticipantResolver } from '../messaging/fake-participant-resolver.ts';
import { FakeInboundCryptoService } from './fake-crypto-service.ts';
import { FakeDeliveryService } from './fake-delivery-service.ts';
import { FakeInboundHubClient } from './fake-hub.ts';

const SELF: AnalysisParticipant = {
    nodeId: 'node-self',
    nodeType: 'default',
    clientId: 'client-self',
    publicKey: 'pk-self',
};
const SENDER: AnalysisParticipant = {
    nodeId: 'node-b',
    nodeType: 'default',
    clientId: 'client-b',
    publicKey: 'pk-b',
};

/** The decrypted message object delivered to the webhook — the SDK's own envelope rides in `meta`. */
const MESSAGE_BODY = {
    greeting: 'hi',
    meta: {
        id: 'm-1',
        sender: 'node-b',
    },
};

function inboundMessage(overrides: Partial<Message> = {}): Message {
    return {
        id: 'msg-1',
        sender_type: 'client',
        sender_id: 'client-b',
        recipient_type: 'client',
        recipient_id: 'client-self',
        data: 'cipher-1',
        metadata: { analysisId: 'a1' },
        created_at: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

function setup() {
    const hub = new FakeInboundHubClient();
    const crypto = new FakeInboundCryptoService();
    const resolver = new FakeParticipantResolver();
    const delivery = new FakeDeliveryService();

    resolver.participantsByAnalysis.set('a1', [SELF, SENDER]);
    crypto.plaintextByPayload.set('cipher-1', JSON.stringify(MESSAGE_BODY));

    const processor = new InboundDeliveryProcessor(
        {
            hub,
            crypto,
            resolver,
            delivery,
        },
        {
            waitMs: 50,
            errorBackoffMs: 5,
        },
    );

    return {
        hub,
        crypto,
        resolver,
        delivery,
        processor,
    };
}

describe('core/inbound/processor', () => {
    it('resolves the sender key, decrypts, delivers, and acks a message', async () => {
        const {
            crypto,
            delivery,
            hub,
            processor,
        } = setup();

        const acked = await processor.processBatch([inboundMessage()]);

        expect(acked).toEqual(['msg-1']);
        // the analysis is bound into the open's key derivation (HKDF info)
        expect(crypto.openCalls).toEqual([{
            payload: 'cipher-1', 
            senderPublicKey: 'pk-b', 
            info: 'a1', 
        }]);
        expect(delivery.delivered).toEqual([{ analysisId: 'a1', message: MESSAGE_BODY }]);
        expect(hub.acked).toEqual([['msg-1']]);
    });

    it('isolates a decrypt failure and still delivers and acks the rest of the batch', async () => {
        const {
            crypto,
            delivery,
            hub,
            processor,
        } = setup();
        crypto.undecryptable.add('cipher-bad');
        crypto.plaintextByPayload.set('cipher-2', JSON.stringify({ ok: true }));

        const acked = await processor.processBatch([
            inboundMessage({ id: 'bad', data: 'cipher-bad' }),
            inboundMessage({ id: 'good', data: 'cipher-2' }),
        ]);

        expect(acked).toEqual(['good']);
        expect(delivery.delivered.map((entry) => entry.message)).toEqual([{ ok: true }]);
        expect(hub.acked).toEqual([['good']]);
    });

    it('does not ack a message whose local delivery fails (left for redelivery)', async () => {
        const {
            delivery,
            hub,
            processor,
        } = setup();
        delivery.failAnalyses.add('a1');

        const acked = await processor.processBatch([inboundMessage()]);

        expect(acked).toEqual([]);
        expect(hub.acked).toEqual([]);
    });

    it('skips messages without an analysisId or ciphertext payload', async () => {
        const {
            delivery,
            hub,
            processor,
        } = setup();

        const acked = await processor.processBatch([
            inboundMessage({ id: 'no-analysis', metadata: null }),
            inboundMessage({ id: 'no-cipher', data: null }),
        ]);

        expect(acked).toEqual([]);
        expect(delivery.delivered).toEqual([]);
        expect(hub.acked).toEqual([]);
    });

    it('skips a message from an unknown sender', async () => {
        const { delivery, processor } = setup();

        const acked = await processor.processBatch([inboundMessage({ sender_id: 'client-stranger' })]);

        expect(acked).toEqual([]);
        expect(delivery.delivered).toEqual([]);
    });

    it('drains the backlog on a wakeup, then unsubscribes on stop', async () => {
        const {
            hub,
            delivery,
            processor,
        } = setup();

        // start with an empty mailbox so the fallback loop parks; the wakeup-triggered drain
        // is what picks up the message seeded afterwards.
        processor.start();
        expect(hub.wakeupListenerCount).toBe(1);

        hub.pullBatches.push([inboundMessage()]);
        hub.emitWakeup({ type: 'client', id: 'client-self' });
        await processor.whenIdle();

        expect(delivery.delivered).toEqual([{ analysisId: 'a1', message: MESSAGE_BODY }]);
        expect(hub.acked).toEqual([['msg-1']]);

        await processor.stop();
        expect(hub.wakeupListenerCount).toBe(0);
        hub.releaseParked();
    });

    it('delivers and acks a backlog via the long-poll fallback, without any wakeup', async () => {
        const {
            hub,
            delivery,
            processor,
        } = setup();
        hub.pullBatches.push([inboundMessage()]);

        // no emitWakeup — the fallback loop's pull({ wait }) must catch the pending message
        processor.start();

        await vi.waitFor(() => {
            expect(delivery.delivered).toEqual([{ analysisId: 'a1', message: MESSAGE_BODY }]);
        });
        expect(hub.acked).toEqual([['msg-1']]);

        await processor.stop();
        hub.releaseParked();
    });
});
