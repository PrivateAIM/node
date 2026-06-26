/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * A failure while processing one inbound message. `permanent` distinguishes failures that
 * can never succeed on retry (no `analysisId`, unknown sender, decrypt/parse error — drop
 * immediately) from transient ones (participant-resolution / webhook outage — retry up to a
 * cap before dead-lettering).
 */
export class InboundProcessingError extends Error {
    readonly permanent: boolean;

    constructor(message: string, options: { permanent: boolean, cause?: unknown }) {
        super(message, { cause: options.cause });
        this.name = 'InboundProcessingError';
        this.permanent = options.permanent;
    }
}
