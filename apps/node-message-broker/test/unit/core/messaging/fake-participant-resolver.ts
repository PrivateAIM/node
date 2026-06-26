/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { AnalysisParticipant, IParticipantResolver } from '../../../../src/core/analysis/index.ts';

/** In-memory `IParticipantResolver` returning configurable participants per analysis. */
export class FakeParticipantResolver implements IParticipantResolver {
    participantsByAnalysis = new Map<string, AnalysisParticipant[]>();

    selfByAnalysis = new Map<string, AnalysisParticipant>();

    resolve = async (analysisId: string): Promise<AnalysisParticipant[]> => this.participantsByAnalysis.get(analysisId) ?? [];

    resolveSelf = async (analysisId: string): Promise<AnalysisParticipant | undefined> => this.selfByAnalysis.get(analysisId);
}
