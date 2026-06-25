/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MessageSealInput } from '@privateaim/kit';

export type { MessageSealInput };

/**
 * Node-to-node end-to-end crypto port.
 *
 * Seals outbound messages for a recipient node and opens inbound messages from a
 * sender node, using ECDH (P-256) + per-message HKDF + AES-256-GCM via
 * `@privateaim/kit`'s `sealMessage` / `openMessage`. The node holds exactly one
 * ECDH keypair; the operator supplies the private key (hex-encoded PKCS#8 PEM)
 * and peer public keys arrive hex-encoded SPKI PEM. The hub only ever sees the
 * opaque base64 frame and never decrypts it.
 *
 * Implemented by `CryptoService` in `adapters/crypto/service.ts`.
 */
export interface ICryptoService {
    /**
     * Seal `data` for the recipient node. Returns the base64 frame
     * (`salt ‖ iv ‖ ciphertext‖tag`) to relay through the hub.
     *
     * @param data               plaintext (bytes or UTF-8 string)
     * @param recipientPublicKey recipient node ECDH public key, hex-encoded SPKI PEM
     * @param info               optional HKDF context; the opener must pass the identical value
     */
    seal(data: MessageSealInput, recipientPublicKey: string, info?: MessageSealInput): Promise<string>;

    /**
     * Open a base64 frame produced by a sender node. Returns the decrypted
     * plaintext bytes; the caller decodes to string if needed.
     *
     * @param payload         the base64 frame from `sealMessage`
     * @param senderPublicKey sender node ECDH public key, hex-encoded SPKI PEM
     * @param info            the identical HKDF context the sealer used, if any
     */
    open(payload: string, senderPublicKey: string, info?: MessageSealInput): Promise<Uint8Array>;
}
