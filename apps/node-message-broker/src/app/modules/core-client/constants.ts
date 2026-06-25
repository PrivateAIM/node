/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { TypedToken } from 'eldin';
import type { IAnalysisClientLookup, IParticipantResolver } from '../../../core/analysis/index.ts';

export const CoreClientInjectionKey = {
    ParticipantResolver: new TypedToken<IParticipantResolver>('ParticipantResolver'),
    AnalysisClientLookup: new TypedToken<IAnalysisClientLookup>('AnalysisClientLookup'),
};
