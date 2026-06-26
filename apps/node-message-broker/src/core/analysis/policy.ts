/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ForbiddenError } from '@ebec/http';
import type { IAnalysisClientLookup } from './types.ts';

/**
 * Assert the caller's client owns `analysisId` — the node-specific analysis-scope rule
 * (the Hub is analysis-agnostic). The caller's client comes from the verified request
 * identity and must equal the analysis's client in server-core. Throws
 * {@link ForbiddenError} on a missing client or a mismatch.
 *
 * Each analysis has a **dedicated** client (1:1), so matching the caller's client to the
 * analysis owner is exact analysis-level isolation — a different analysis resolves to a
 * different client, and a caller can only satisfy the check for its own analysis.
 *
 * The `ANALYSIS_SELF_MESSAGE_BROKER_USE` capability is enforced separately at the route
 * via the request permission checker, so it is intentionally not handled here.
 */
export async function assertClientOwnsAnalysis(
    analyses: IAnalysisClientLookup,
    analysisId: string,
    clientId: string | undefined,
): Promise<void> {
    if (!clientId) {
        throw new ForbiddenError('The caller is not bound to a client.');
    }

    const analysisClientId = await analyses.getClientId(analysisId);
    if (!analysisClientId || analysisClientId !== clientId) {
        throw new ForbiddenError('The caller does not belong to this analysis.');
    }
}
