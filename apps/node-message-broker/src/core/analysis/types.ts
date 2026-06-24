/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** A node participating in an analysis, addressable on the Hub by its node client. */
export type AnalysisParticipant = {
    nodeId: string,
    nodeType: string,
    clientId: string
};

/**
 * Analysis authorization lives node-side (the Hub is analysis-agnostic). Asserts
 * the calling analysis client holds `ANALYSIS_SELF_MESSAGE_BROKER_USE` — read from
 * the analysis client's token claims, or via server-core introspection.
 */
export interface IAnalysisPolicy {
    assertMayUse(analysisId: string, token: string): Promise<void>;
}

/**
 * Resolves which node-clients participate in an analysis, via server-core's
 * existing analysis-node API. Cacheable; kept off the Hub's hot path.
 */
export interface IParticipantResolver {
    resolve(analysisId: string): Promise<AnalysisParticipant[]>;

    resolveSelf(analysisId: string): Promise<AnalysisParticipant | undefined>;
}
