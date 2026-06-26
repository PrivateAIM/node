/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ForbiddenError } from '@ebec/http';
import { describe, expect, it } from 'vitest';
import { assertClientOwnsAnalysis } from '../../../../src/core/analysis/index.ts';
import { FakeAnalysisClientLookup } from './fake-analysis-client-lookup.ts';

describe('core/analysis/policy', () => {
    it('allows a caller whose client owns the analysis', async () => {
        const analyses = new FakeAnalysisClientLookup();

        await expect(assertClientOwnsAnalysis(analyses, 'a1', 'client-analysis')).resolves.toBeUndefined();
        expect(analyses.calls).toEqual(['a1']);
    });

    it('rejects a caller not bound to a client with a ForbiddenError', async () => {
        const analyses = new FakeAnalysisClientLookup();

        const error = await assertClientOwnsAnalysis(analyses, 'a1', undefined).catch((err) => err);
        expect(error).toBeInstanceOf(ForbiddenError);
        expect(error.message).toMatch(/not bound to a client/i);
        // the analysis is never looked up once the caller has no client
        expect(analyses.calls).toEqual([]);
    });

    it('rejects an unknown analysis (no owner client) with a ForbiddenError', async () => {
        const analyses = new FakeAnalysisClientLookup();

        const error = await assertClientOwnsAnalysis(analyses, 'unknown', 'client-analysis').catch((err) => err);
        expect(error).toBeInstanceOf(ForbiddenError);
        expect(error.message).toMatch(/does not belong to this analysis/i);
    });

    it('rejects when the caller client does not own the analysis with a ForbiddenError', async () => {
        const analyses = new FakeAnalysisClientLookup();
        analyses.clientIdByAnalysis.set('a1', 'client-other');

        const error = await assertClientOwnsAnalysis(analyses, 'a1', 'client-analysis').catch((err) => err);
        expect(error).toBeInstanceOf(ForbiddenError);
        expect(error.message).toMatch(/does not belong to this analysis/i);
    });
});
