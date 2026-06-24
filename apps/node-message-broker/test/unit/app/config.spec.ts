/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../../../src/app/modules/config/normalize.ts';

describe('app/config', () => {
    it('applies defaults for an empty input', async () => {
        const config = await normalizeConfig({});

        expect(config.port).toBe(3000);
        expect(config.realm).toBe('master');
        expect(config.authupURL).toBeDefined();
        expect(config.hubURL).toBeDefined();
        expect(config.coreURL).toBeDefined();
    });

    it('keeps provided values', async () => {
        const config = await normalizeConfig({
            port: 4001,
            hubURL: 'https://hub.example.org/',
            coreURL: 'https://core.example.org/',
        });

        expect(config.port).toBe(4001);
        expect(config.hubURL).toBe('https://hub.example.org/');
        expect(config.coreURL).toBe('https://core.example.org/');
    });
});
