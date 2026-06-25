/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { CoreNode, IAnalysisNodeProvider } from '../../../../src/core/analysis/index.ts';

/**
 * In-memory `IAnalysisNodeProvider` that records every lookup and returns
 * configurable canned nodes per analysis — stands in for the server-core
 * analysis-node lookup so the resolver is testable without a live core client.
 */
export class FakeAnalysisNodeProvider implements IAnalysisNodeProvider {
    calls: string[] = [];

    nodesByAnalysis = new Map<string, CoreNode[]>();

    /** When set, the next `list` rejects with this error. */
    error: Error | undefined;

    list = async (analysisId: string): Promise<CoreNode[]> => {
        this.calls.push(analysisId);
        if (this.error) {
            throw this.error;
        }
        return this.nodesByAnalysis.get(analysisId) ?? [];
    };
}
