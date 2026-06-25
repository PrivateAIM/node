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
    clientId: string,
    /** the node's ECDH public key (hex-encoded SPKI PEM) for node-to-node E2E crypto */
    publicKey: string
};

/** The slice of a server-core `Node` the broker reads off the analysis-node relation. */
export type CoreNode = {
    id: string,
    type: string,
    client_id: string | null,
    public_key: string | null
};

/**
 * Lists the nodes participating in an analysis — server-core's analysis-node
 * relation with the `node` included. Declared as a narrow port so the resolver can
 * be tested with a fake; the live implementation (in `app/modules/core-client`)
 * wraps `@privateaim/core-http-kit`'s `analysisNode.getMany`.
 */
export interface IAnalysisNodeProvider {
    list(analysisId: string): Promise<CoreNode[]>;
}

/**
 * Resolves the Authup client id that owns an analysis (server-core), used to bind
 * a caller to its analysis. Narrow port; the live implementation wraps
 * `@privateaim/core-http-kit`'s `analysis.getOne`.
 */
export interface IAnalysisClientLookup {
    getClientId(analysisId: string): Promise<string | null>;
}

/**
 * Resolves which node-clients participate in an analysis, via server-core's
 * existing analysis-node API. Cacheable; kept off the Hub's hot path.
 */
export interface IParticipantResolver {
    resolve(analysisId: string): Promise<AnalysisParticipant[]>;

    resolveSelf(analysisId: string): Promise<AnalysisParticipant | undefined>;
}
