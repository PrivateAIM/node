/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isValidupError } from 'validup';
import { describe, expect, it } from 'vitest';
import type { AnalysisMessagePayload } from '../../../../src/adapters/http/controllers/messages/types.ts';
import {
    AnalysisMessageValidator,
    MESSAGE_SEND_GROUP,
    WebhookSubscriptionValidator,
} from '../../../../src/adapters/http/controllers/messages/validators/index.ts';

describe('adapters/http/controllers/messages/validators', () => {
    describe('AnalysisMessageValidator (send group)', () => {
        const validator = new AnalysisMessageValidator();
        const run = (body: Partial<AnalysisMessagePayload>) => validator.run(body, { group: MESSAGE_SEND_GROUP });

        it('accepts node-id recipients and an opaque JSON object message', async () => {
            const message = { hello: 'world', meta: { id: 'm-1' } };
            const result = await run({ recipients: ['node-a', 'node-b'], message });
            expect(result).toEqual({ recipients: ['node-a', 'node-b'], message });
        });

        it('accepts a string or array message (arbitrary JSON)', async () => {
            await expect(run({ recipients: ['node-a'], message: 'plain' })).resolves.toMatchObject({ message: 'plain' });
            await expect(run({ recipients: ['node-a'], message: [1, 2, 3] })).resolves.toMatchObject({ message: [1, 2, 3] });
        });

        it('strips unknown top-level keys from the result', async () => {
            const body = {
                recipients: ['node-a'], 
                message: { a: 1 }, 
                junk: 'x', 
            };
            const result = await run(body);
            expect(result).not.toHaveProperty('junk');
        });

        it('rejects empty, missing, or non-string recipients', async () => {
            await expect(run({ recipients: [], message: { a: 1 } })).rejects.toThrow(/recipients/i);
            await expect(run({ message: { a: 1 } })).rejects.toThrow(/recipients/i);
            await expect(run({ recipients: [''], message: { a: 1 } })).rejects.toThrow(/recipients/i);
        });

        it('rejects a missing or null message', async () => {
            await expect(run({ recipients: ['node-a'] })).rejects.toThrow(/message/i);
            await expect(run({ recipients: ['node-a'], message: null })).rejects.toThrow(/message/i);
        });

        it('throws a ValidupError (so the error middleware renders a 400)', async () => {
            const error = await run({}).catch((err) => err);
            expect(isValidupError(error)).toBe(true);
        });
    });

    describe('AnalysisMessageValidator (broadcast, no group)', () => {
        const validator = new AnalysisMessageValidator();

        it('validates message alone and ignores recipients', async () => {
            const result = await validator.run({ message: { ping: true } });
            expect(result).toEqual({ message: { ping: true } });
        });

        it('still requires a message', async () => {
            await expect(validator.run({})).rejects.toThrow(/message/i);
        });
    });

    describe('WebhookSubscriptionValidator', () => {
        const validator = new WebhookSubscriptionValidator();

        it('accepts an absolute URL', async () => {
            await expect(validator.run({ webhookUrl: 'http://nginx/analysis/webhook' }))
                .resolves.toEqual({ webhookUrl: 'http://nginx/analysis/webhook' });
        });

        it('rejects a missing or malformed webhookUrl', async () => {
            await expect(validator.run({})).rejects.toThrow(/webhookUrl/i);
            await expect(validator.run({ webhookUrl: 'not-a-url' })).rejects.toThrow(/webhookUrl/i);
        });
    });
});
