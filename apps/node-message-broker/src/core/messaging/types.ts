/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MessageSealInput } from '@privateaim/kit';
import type { IParticipantResolver } from '../analysis/index.ts';
import type { ICryptoService } from '../crypto/index.ts';
import type { IHubClient } from '../hub/index.ts';

/** The ports the analysis-message dispatch fans out across. */
export type MessageDispatchDeps = {
    resolver: IParticipantResolver,
    crypto: ICryptoService,
    hub: IHubClient
};

/** An analysis message addressed to specific participant nodes (the SDK addresses by node id). */
export type OutboundAnalysisMessage = {
    analysisId: string,
    recipientNodeIds: string[],
    /** plaintext payload (bytes or string); sealed per recipient before relay */
    data: MessageSealInput
};
