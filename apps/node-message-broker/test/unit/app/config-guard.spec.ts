/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EnvironmentName } from '@privateaim/server-kit';
import { describe, expect, it } from 'vitest';
import { assertProductionConfig } from '../../../src/app/modules/config/guard.ts';

const FULL_ENV = {
    AUTHUP_URL: 'https://authup.example',
    CLIENT_ID: 'node-x',
    CLIENT_SECRET: 'super-secret',
    REALM: 'flame',
    NODE_PRIVATE_KEY: 'deadbeef',
};

describe('app/config/assertProductionConfig', () => {
    it('passes in production when the full security stack is set', () => {
        expect(() => assertProductionConfig({ env: EnvironmentName.PRODUCTION }, FULL_ENV)).not.toThrow();
    });

    it('throws in production listing every missing security var', () => {
        const error = (() => {
            try {
                assertProductionConfig({ env: EnvironmentName.PRODUCTION }, { AUTHUP_URL: 'https://authup.example' });
                return undefined;
            } catch (err) {
                return err as Error;
            }
        })();

        expect(error).toBeInstanceOf(Error);
        expect(error?.message).toMatch(/CLIENT_ID/);
        expect(error?.message).toMatch(/CLIENT_SECRET/);
        expect(error?.message).toMatch(/REALM/);
        expect(error?.message).toMatch(/NODE_PRIVATE_KEY/);
        // a provided var is not reported
        expect(error?.message).not.toMatch(/AUTHUP_URL/);
    });

    it('treats an empty-string value as unset', () => {
        expect(() => assertProductionConfig({ env: EnvironmentName.PRODUCTION }, { ...FULL_ENV, REALM: '' }))
            .toThrow(/REALM/);
    });

    it('is a no-op outside production (dev defaults are intended)', () => {
        expect(() => assertProductionConfig({ env: EnvironmentName.DEVELOPMENT }, {})).not.toThrow();
        expect(() => assertProductionConfig({ env: EnvironmentName.TEST }, {})).not.toThrow();
    });
});
