/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createValidator } from '@validup/zod';
import { Container } from 'validup';
import zod from 'zod';
import type { AnalysisMessagePayload } from '../types.ts';

/**
 * Validator group that gates the `recipients` attribute to the (non-broadcast) send path.
 * Run the validator with this group for a direct send; run it without a group for a
 * broadcast, which validates `message` alone.
 */
export const MESSAGE_SEND_GROUP = 'send';

/**
 * Validates an outbound analysis message body with validup + zod. `recipients` is a
 * non-empty array of participant node ids, required only under {@link MESSAGE_SEND_GROUP}.
 * `message` is an opaque, non-null JSON payload (object, array, or scalar) relayed verbatim;
 * unknown top-level keys are stripped from the validated result.
 */
export class AnalysisMessageValidator extends Container<AnalysisMessagePayload> {
    protected initialize() {
        super.initialize();

        this.mount(
            'recipients',
            { group: MESSAGE_SEND_GROUP },
            createValidator(zod.array(zod.string().min(1)).min(1)),
        );

        this.mount('message', createValidator(zod.union([
            zod.looseObject({}),
            zod.array(zod.any()),
            zod.string(),
            zod.number(),
            zod.boolean(),
        ])));
    }
}
