/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { assertClientOwnsAnalysis } from '../../../../src/core/analysis/index.ts';
import { FakeAnalysisClientLookup } from './fake-analysis-client-lookup.ts';

describe('core/analysis/policy', () => {
    it('allows a caller whose client owns the analysis', async () => {
        const analyses = new FakeAnalysisClientLookup();

        await expect(assertClientOwnsAnalysis(analyses, 'a1', 'client-analysis')).resolves.toBeUndefined();
        expect(analyses.calls).toEqual(['a1']);
    });

    it('rejects a caller not bound to a client', async () => {
        const analyses = new FakeAnalysisClientLookup();

        await expect(assertClientOwnsAnalysis(analyses, 'a1', undefined)).rejects.toThrow(/not bound to a client/i);
        // the analysis is never looked up once the caller has no client
        expect(analyses.calls).toEqual([]);
    });

    it('rejects when the analysis is unknown / has no client', async () => {
        const analyses = new FakeAnalysisClientLookup();

        await expect(assertClientOwnsAnalysis(analyses, 'unknown', 'client-analysis'))
            .rejects.toThrow(/does not belong to this analysis/i);
    });

    it('rejects when the caller client does not own the analysis', async () => {
        const analyses = new FakeAnalysisClientLookup();
        analyses.clientIdByAnalysis.set('a1', 'client-other');

        await expect(assertClientOwnsAnalysis(analyses, 'a1', 'client-analysis'))
            .rejects.toThrow(/does not belong to this analysis/i);
    });
});
