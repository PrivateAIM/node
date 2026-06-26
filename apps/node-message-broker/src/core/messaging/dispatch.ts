/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BadRequestError } from '@ebec/http';
import type { MessageSealInput } from '@privateaim/kit';
import { MessagePartyKind } from '@privateaim/messenger-kit';
import type { AnalysisParticipant } from '../analysis/index.ts';
import type { MessageDispatchDeps, OutboundAnalysisMessage } from './types.ts';

/**
 * Fan out an analysis message to the named participant nodes: seal it under each
 * recipient node's public key (distinct ciphertext per recipient) and relay one Hub
 * `send` per recipient, tagging `metadata.analysisId`. Resolves with the Hub message
 * ids. An unknown recipient node id is rejected with {@link BadRequestError}.
 */
export async function dispatchAnalysisMessage(
    deps: MessageDispatchDeps,
    input: OutboundAnalysisMessage,
): Promise<string[]> {
    const participants = await deps.resolver.resolve(input.analysisId);
    const byNodeId = new Map(participants.map((participant) => [participant.nodeId, participant]));

    const recipients = input.recipientNodeIds.map((nodeId) => {
        const participant = byNodeId.get(nodeId);
        if (!participant) {
            throw new BadRequestError(`'${nodeId}' is not a participant of this analysis.`);
        }
        return participant;
    });

    return sendSealed(deps, input.analysisId, recipients, input.data);
}

/** Broadcast an analysis message to every participant node except this one. */
export async function broadcastAnalysisMessage(
    deps: MessageDispatchDeps,
    input: { analysisId: string, data: MessageSealInput },
): Promise<string[]> {
    const [participants, self] = await Promise.all([
        deps.resolver.resolve(input.analysisId),
        deps.resolver.resolveSelf(input.analysisId),
    ]);

    const recipients = participants.filter((participant) => !self || participant.nodeId !== self.nodeId);
    return sendSealed(deps, input.analysisId, recipients, input.data);
}

async function sendSealed(
    deps: MessageDispatchDeps,
    analysisId: string,
    recipients: AnalysisParticipant[],
    data: MessageSealInput,
): Promise<string[]> {
    const sent = await Promise.all(recipients.map(async (recipient) => {
        // Bind the analysis into the key derivation (HKDF info) so the recipient's
        // `open` only succeeds when the relayed `metadata.analysisId` is unchanged — a
        // relabel by the untrusted Hub (or a replay) fails to decrypt instead of being
        // delivered to the wrong analysis's webhooks.
        const sealed = await deps.crypto.seal(data, recipient.publicKey, analysisId);
        return deps.hub.send({
            recipients: [{ type: MessagePartyKind.CLIENT, id: recipient.clientId }],
            data: sealed,
            metadata: { analysisId },
        });
    }));

    return sent.flat();
}
