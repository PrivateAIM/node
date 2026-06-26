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
            maxAttempts: 3,
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

    it('dead-letters a permanently undecryptable message and still delivers the rest', async () => {
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

        // a decrypt failure is permanent → dropped (acked away), not retried forever
        expect(acked).toEqual(['bad', 'good']);
        expect(processor.droppedCount).toBe(1);
        expect(delivery.delivered.map((entry) => entry.message)).toEqual([{ ok: true }]);
        expect(hub.acked).toEqual([['bad', 'good']]);
    });

    it('drops permanent failures (no analysisId / ciphertext / unknown sender) on the first attempt', async () => {
        const {
            delivery,
            hub,
            processor,
        } = setup();

        const acked = await processor.processBatch([
            inboundMessage({ id: 'no-analysis', metadata: null }),
            inboundMessage({ id: 'no-cipher', data: null }),
            inboundMessage({ id: 'stranger', sender_id: 'client-stranger' }),
        ]);

        expect(acked).toEqual(['no-analysis', 'no-cipher', 'stranger']);
        expect(processor.droppedCount).toBe(3);
        expect(delivery.delivered).toEqual([]);
        expect(hub.acked).toEqual([['no-analysis', 'no-cipher', 'stranger']]);
    });

    it('retries a transient delivery failure and dead-letters it only after maxAttempts', async () => {
        const {
            delivery,
            hub,
            processor,
        } = setup();
        delivery.failAnalyses.add('a1'); // webhook outage — transient

        // attempts 1 and 2 (< maxAttempts=3): left unacked for redelivery
        expect(await processor.processBatch([inboundMessage()])).toEqual([]);
        expect(await processor.processBatch([inboundMessage()])).toEqual([]);
        expect(processor.droppedCount).toBe(0);
        expect(hub.acked).toEqual([]);

        // attempt 3 reaches the cap → dead-lettered (acked to drop)
        expect(await processor.processBatch([inboundMessage()])).toEqual(['msg-1']);
        expect(processor.droppedCount).toBe(1);
        expect(hub.acked).toEqual([['msg-1']]);
    });

    it('resets the attempt count after a recovered transient failure', async () => {
        const {
            delivery,
            processor,
        } = setup();
        delivery.failAnalyses.add('a1');

        await processor.processBatch([inboundMessage()]); // attempt 1, unacked
        await processor.processBatch([inboundMessage()]); // attempt 2, unacked

        delivery.failAnalyses.delete('a1'); // outage recovers
        const acked = await processor.processBatch([inboundMessage()]);

        // delivered on recovery, dropped nothing, and the counter is cleared for the id
        expect(acked).toEqual(['msg-1']);
        expect(processor.droppedCount).toBe(0);

        // a subsequent transient failure starts counting from one again
        delivery.failAnalyses.add('a1');
        expect(await processor.processBatch([inboundMessage()])).toEqual([]);
        expect(processor.droppedCount).toBe(0);
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
