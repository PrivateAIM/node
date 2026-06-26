/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IAnalysisClientLookup } from '../../../../src/core/analysis/index.ts';

/**
 * In-memory `IAnalysisClientLookup` that records every lookup and resolves the owning
 * client id from a configurable map — stands in for server-core's analysis → client
 * lookup so the analysis policy is testable without a live core client. Unknown
 * analyses resolve to `null`.
 */
export class FakeAnalysisClientLookup implements IAnalysisClientLookup {
    calls: string[] = [];

    clientIdByAnalysis = new Map<string, string | null>([['a1', 'client-analysis']]);

    getClientId = async (analysisId: string): Promise<string | null> => {
        this.calls.push(analysisId);
        return this.clientIdByAnalysis.get(analysisId) ?? null;
    };
}
