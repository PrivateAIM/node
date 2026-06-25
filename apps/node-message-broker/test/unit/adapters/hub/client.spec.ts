/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MessageParty, SendMessageRequest } from '@privateaim/messenger-kit';
import { describe, expect, it } from 'vitest';
import { HubClient } from '../../../../src/adapters/hub/index.ts';
import { FakeMessengerClient } from './fake-messenger-client.ts';
import { FakeWakeupSource } from './fake-wakeup-source.ts';

function setup() {
    const client = new FakeMessengerClient();
    const wakeup = new FakeWakeupSource();
    const hubClient = new HubClient({ client, wakeup });
    return {
        client, 
        wakeup, 
        hubClient, 
    };
}

describe('adapters/hub/client', () => {
    const recipient: MessageParty = { type: 'client', id: 'node-1' };

    it('relays send to the messenger client and returns the persisted ids', async () => {
        const { client, hubClient } = setup();
        client.sendResult = ['m1', 'm2'];

        const request: SendMessageRequest = { recipients: [recipient], data: 'cipher' };
        const ids = await hubClient.send(request);

        expect(ids).toEqual(['m1', 'm2']);
        expect(client.sent).toEqual([request]);
    });

    it('forwards the pull query and returns the response', async () => {
        const { client, hubClient } = setup();
        client.pullResult = {
            messages: [{
                id: 'm1',
                sender_type: 'client',
                sender_id: 'other',
                recipient_type: 'client',
                recipient_id: 'node-1',
                data: 'cipher',
                metadata: null,
                created_at: '2026-01-01T00:00:00.000Z',
            }],
        };

        const response = await hubClient.pull({ limit: 10, wait: 5000 });

        expect(client.pulled).toEqual([{ limit: 10, wait: 5000 }]);
        expect(response.messages).toHaveLength(1);
    });

    it('relays ack to the messenger client', async () => {
        const { client, hubClient } = setup();

        await hubClient.ack({ ids: ['m1', 'm2'] });

        expect(client.acked).toEqual([{ ids: ['m1', 'm2'] }]);
    });

    it('delivers wakeups as the recipient and supports unsubscribe', () => {
        const { wakeup, hubClient } = setup();
        const received: MessageParty[] = [];

        const unsubscribe = hubClient.onWakeup((party) => received.push(party));
        wakeup.emit({ recipient });
        unsubscribe();
        wakeup.emit({ recipient });

        expect(received).toEqual([recipient]);
    });

    it('delegates start and stop to the wakeup source', async () => {
        const { wakeup, hubClient } = setup();

        await hubClient.start();
        await hubClient.stop();

        expect(wakeup.started).toBe(1);
        expect(wakeup.stopped).toBe(1);
    });
});
