/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Logger } from '@privateaim/server-kit';
import { LRUCache } from 'lru-cache';
import type {
    AnalysisParticipant,
    IAnalysisNodeProvider,
    IParticipantResolver,
} from '../../core/analysis/index.ts';

const DEFAULT_CACHE_MAX = 256;

const DEFAULT_CACHE_TTL_MS = 30_000;

type ParticipantResolverContext = {
    provider: IAnalysisNodeProvider,
    /** this node's own authup client id (config.clientId) — used by {@link resolveSelf} */
    selfClientId: string,
    cacheMax?: number,
    /** per-analysis cache lifetime; `<= 0` disables caching. */
    cacheTtlMs?: number,
    logger?: Logger
};

/**
 * Resolves analysis participants — their node id / type / client id / public key —
 * from server-core's analysis-node API, mapping each included `node` to an
 * {@link AnalysisParticipant}. Results are cached per analysis (short TTL) to keep
 * resolution off the Hub send/deliver hot path; participants missing a client id
 * or public key are skipped, since they can't be addressed or encrypted to.
 */
export class ParticipantResolver implements IParticipantResolver {
    protected provider: IAnalysisNodeProvider;

    protected selfClientId: string;

    protected logger: Logger | undefined;

    protected cache: LRUCache<string, Promise<AnalysisParticipant[]>> | undefined;

    constructor(ctx: ParticipantResolverContext) {
        this.provider = ctx.provider;
        this.selfClientId = ctx.selfClientId;
        this.logger = ctx.logger;

        const ttl = ctx.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
        if (ttl > 0) {
            this.cache = new LRUCache<string, Promise<AnalysisParticipant[]>>({
                max: Math.max(1, Math.floor(ctx.cacheMax ?? DEFAULT_CACHE_MAX)),
                ttl,
            });
        }
    }

    resolve(analysisId: string): Promise<AnalysisParticipant[]> {
        const cached = this.cache?.get(analysisId);
        if (cached) {
            return cached;
        }

        const promise = this.fetch(analysisId);

        const { cache } = this;
        if (cache) {
            // evict a rejected fetch so a transient failure isn't cached for the TTL
            promise.catch(() => {
                if (cache.peek(analysisId) === promise) {
                    cache.delete(analysisId);
                }
            });
            cache.set(analysisId, promise);
        }

        return promise;
    }

    async resolveSelf(analysisId: string): Promise<AnalysisParticipant | undefined> {
        const participants = await this.resolve(analysisId);
        return participants.find((participant) => participant.clientId === this.selfClientId);
    }

    protected async fetch(analysisId: string): Promise<AnalysisParticipant[]> {
        const nodes = await this.provider.list(analysisId);

        const participants: AnalysisParticipant[] = [];
        for (const node of nodes) {
            if (!node.client_id || !node.public_key) {
                this.logger?.warn(
                    `Analysis ${analysisId}: skipping participant ${node.id} with a missing client id or public key`,
                );
                continue;
            }

            participants.push({
                nodeId: node.id,
                nodeType: node.type,
                clientId: node.client_id,
                publicKey: node.public_key,
            });
        }

        return participants;
    }
}
