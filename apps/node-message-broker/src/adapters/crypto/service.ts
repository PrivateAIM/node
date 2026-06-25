/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    hexToUTF8,
    importAsymmetricPrivateKey,
    importAsymmetricPublicKey,
    isHex,
    openMessage,
    sealMessage,
} from '@privateaim/kit';
import type { MessageSealInput } from '@privateaim/kit';
import type { ICryptoService } from '../../core/crypto/index.ts';

const ECDH_PARAMS = { name: 'ECDH', namedCurve: 'P-256' } as const;

const DEFAULT_PUBLIC_KEY_CACHE_MAX = 1024;

type CryptoServiceContext = {
    privateKey?: string, // hex-encoded PKCS#8 PEM (config.nodePrivateKey, OPTIONAL)
    publicKeyCacheMax?: number, // max imported peer keys to retain (LRU); default 1024
};

/**
 * End-to-end crypto adapter backed by `@privateaim/kit`.
 *
 * Holds the node's single ECDH private key (hex-encoded PKCS#8 PEM, supplied by
 * the operator via `config.nodePrivateKey`, lazily imported once and cached).
 * Peer ECDH public keys arrive hex-encoded SPKI PEM and are imported with EMPTY
 * usages and cached by their hex string. `seal` / `open` delegate to the kit's
 * `sealMessage` / `openMessage` (per-message HKDF salt + AES-256-GCM); this
 * adapter never touches AES, HKDF or nonces directly.
 */
export class CryptoService implements ICryptoService {
    protected privateKey?: string;

    private privateKeyPromise?: Promise<CryptoKey>;

    protected readonly publicKeyCacheMax: number;

    // Bounded LRU keyed by the raw hex PEM (distinct keys never collide). The peer
    // set is operator-controlled and small, so the cap is only a backstop against
    // unbounded growth over a long-lived process.
    protected readonly publicKeyCache = new Map<string, Promise<CryptoKey>>();

    constructor(ctx: CryptoServiceContext) {
        this.privateKey = ctx.privateKey;
        this.publicKeyCacheMax = Math.max(1, ctx.publicKeyCacheMax ?? DEFAULT_PUBLIC_KEY_CACHE_MAX);
    }

    private getPrivateKey(): Promise<CryptoKey> {
        if (this.privateKeyPromise) {
            return this.privateKeyPromise;
        }

        const hex = this.privateKey;
        if (!hex) {
            throw new Error('Node private key is not configured (NODE_PRIVATE_KEY is missing).');
        }

        if (!isHex(hex)) {
            throw new Error('Node private key is not a valid hex-encoded PEM string.');
        }

        // Cache the in-flight import, but evict a rejected result so a corrected
        // key can be retried rather than failing forever.
        const promise = importAsymmetricPrivateKey(hexToUTF8(hex), ECDH_PARAMS);
        promise.catch(() => {
            if (this.privateKeyPromise === promise) {
                this.privateKeyPromise = undefined;
            }
        });
        this.privateKeyPromise = promise;
        return promise;
    }

    private getPublicKey(hex: string): Promise<CryptoKey> {
        const cached = this.publicKeyCache.get(hex);
        if (cached) {
            // re-insert to mark as most-recently-used
            this.publicKeyCache.delete(hex);
            this.publicKeyCache.set(hex, cached);
            return cached;
        }

        if (!isHex(hex)) {
            throw new Error('Peer public key is not a valid hex-encoded PEM string.');
        }

        const promise = importAsymmetricPublicKey(hexToUTF8(hex), ECDH_PARAMS);
        promise.catch(() => {
            if (this.publicKeyCache.get(hex) === promise) {
                this.publicKeyCache.delete(hex);
            }
        });

        // evict the least-recently-used entry (oldest insertion) past the cap
        while (this.publicKeyCache.size >= this.publicKeyCacheMax) {
            const oldest = this.publicKeyCache.keys().next().value;
            if (oldest === undefined) {
                break;
            }
            this.publicKeyCache.delete(oldest);
        }

        this.publicKeyCache.set(hex, promise);
        return promise;
    }

    async seal(data: MessageSealInput, recipientPublicKey: string, info?: MessageSealInput): Promise<string> {
        const privateKey = await this.getPrivateKey();
        const publicKey = await this.getPublicKey(recipientPublicKey);
        return sealMessage({
            privateKey,
            publicKey,
            data,
            info,
        });
    }

    async open(payload: string, senderPublicKey: string, info?: MessageSealInput): Promise<Uint8Array> {
        const privateKey = await this.getPrivateKey();
        const publicKey = await this.getPublicKey(senderPublicKey);
        return openMessage({
            privateKey,
            publicKey,
            payload,
            info,
        });
    }
}
