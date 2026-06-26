/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MessageSealInput } from '@privateaim/kit';
import type { ICryptoService } from '../../../../src/core/crypto/index.ts';

/**
 * In-memory `ICryptoService` for inbound tests. `open` records each call (incl. the HKDF
 * `info` binding) and returns the plaintext bytes mapped from the ciphertext payload
 * (defaulting to echoing the payload), so a test seals nothing real yet controls exactly
 * what each frame decrypts to. Payloads in {@link undecryptable} reject, modelling a poison
 * frame.
 */
export class FakeInboundCryptoService implements ICryptoService {
    openCalls: {
        payload: string, 
        senderPublicKey: string, 
        info?: MessageSealInput 
    }[] = [];

    plaintextByPayload = new Map<string, string>();

    undecryptable = new Set<string>();

    seal = async (): Promise<string> => '';

    open = async (payload: string, senderPublicKey: string, info?: MessageSealInput): Promise<Uint8Array> => {
        this.openCalls.push({
            payload, 
            senderPublicKey, 
            info, 
        });

        if (this.undecryptable.has(payload)) {
            throw new Error('decryption failed');
        }

        const plaintext = this.plaintextByPayload.get(payload) ?? payload;
        return new TextEncoder().encode(plaintext);
    };
}
