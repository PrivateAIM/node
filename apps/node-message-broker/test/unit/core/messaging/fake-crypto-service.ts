/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MessageSealInput } from '@privateaim/kit';
import type { ICryptoService } from '../../../../src/core/crypto/index.ts';

/**
 * In-memory `ICryptoService` that records seal calls and returns a deterministic
 * `sealed:<recipientPublicKey>` marker, so tests can assert each message was sealed
 * under the correct recipient key without real crypto.
 */
export class FakeCryptoService implements ICryptoService {
    sealCalls: {
        data: MessageSealInput, 
        recipientPublicKey: string, 
        info?: MessageSealInput 
    }[] = [];

    seal = async (data: MessageSealInput, recipientPublicKey: string, info?: MessageSealInput): Promise<string> => {
        this.sealCalls.push({
            data, 
            recipientPublicKey, 
            info, 
        });
        return `sealed:${recipientPublicKey}`;
    };

    open = async (): Promise<Uint8Array> => new Uint8Array();
}
