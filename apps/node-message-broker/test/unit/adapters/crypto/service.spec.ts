/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
    CryptoAsymmetricAlgorithm,
    exportAsymmetricPrivateKey,
    exportAsymmetricPublicKey,
} from '@privateaim/kit';
import { CryptoService } from '../../../../src/adapters/crypto/index.ts';

const ECDH_PARAMS = { name: 'ECDH', namedCurve: 'P-256' } as const;

async function generatePair() {
    const algo = new CryptoAsymmetricAlgorithm(ECDH_PARAMS);
    return algo.generateKeyPair();
}

async function privHex(pair: CryptoKeyPair) {
    const pem = await exportAsymmetricPrivateKey(pair.privateKey);
    return Buffer.from(pem, 'utf8').toString('hex');
}

async function pubHex(pair: CryptoKeyPair) {
    const pem = await exportAsymmetricPublicKey(pair.publicKey);
    return Buffer.from(pem, 'utf8').toString('hex');
}

/** Two configured nodes (A, B) plus their hex-encoded keys. */
async function setup() {
    const a = await generatePair();
    const b = await generatePair();

    const aPrivHex = await privHex(a);
    const aPubHex = await pubHex(a);
    const bPrivHex = await privHex(b);
    const bPubHex = await pubHex(b);

    const serviceA = new CryptoService({ privateKey: aPrivHex });
    const serviceB = new CryptoService({ privateKey: bPrivHex });

    return {
        aPubHex,
        bPubHex,
        serviceA,
        serviceB,
    };
}

describe('adapters/crypto/service', () => {
    it('round-trips A->B and recovers the plaintext bytes', async () => {
        const {
            aPubHex, 
            bPubHex, 
            serviceA, 
            serviceB,
        } = await setup();

        const plaintext = `hello node-to-node ${randomUUID()}`;

        const frame = await serviceA.seal(plaintext, bPubHex);
        const opened = await serviceB.open(frame, aPubHex);

        expect(typeof frame).toBe('string');
        expect(frame.length).toBeGreaterThan(0);
        expect(opened).toBeInstanceOf(Uint8Array);
        expect(new TextDecoder().decode(opened)).toBe(plaintext);
    });

    it('round-trips with raw bytes input', async () => {
        const {
            aPubHex, 
            bPubHex, 
            serviceA, 
            serviceB,
        } = await setup();

        const bytes = new TextEncoder().encode(`binary-${randomUUID()}`);

        const frame = await serviceA.seal(bytes, bPubHex);
        const opened = await serviceB.open(frame, aPubHex);

        expect(Array.from(opened)).toEqual(Array.from(bytes));
    });

    it('produces a distinct frame per seal (per-message HKDF salt) yet both open', async () => {
        const {
            aPubHex, 
            bPubHex, 
            serviceA, 
            serviceB,
        } = await setup();

        const plaintext = `repeat ${randomUUID()}`;

        const frame1 = await serviceA.seal(plaintext, bPubHex);
        const frame2 = await serviceA.seal(plaintext, bPubHex);

        expect(frame1).not.toBe(frame2);
        expect(new TextDecoder().decode(await serviceB.open(frame1, aPubHex))).toBe(plaintext);
        expect(new TextDecoder().decode(await serviceB.open(frame2, aPubHex))).toBe(plaintext);
    });

    it('round-trips with matching info', async () => {
        const {
            aPubHex, 
            bPubHex, 
            serviceA, 
            serviceB,
        } = await setup();

        const info = `analysis:${randomUUID()}`;
        const plaintext = `with-info ${randomUUID()}`;

        const frame = await serviceA.seal(plaintext, bPubHex, info);
        const opened = await serviceB.open(frame, aPubHex, info);

        expect(new TextDecoder().decode(opened)).toBe(plaintext);
    });

    it('throws when info mismatches between seal and open', async () => {
        const {
            aPubHex, 
            bPubHex, 
            serviceA, 
            serviceB,
        } = await setup();

        const frame = await serviceA.seal(`msg ${randomUUID()}`, bPubHex, 'context-A');

        await expect(serviceB.open(frame, aPubHex, 'context-B')).rejects.toThrow();
    });

    it('throws when info present on seal but absent on open', async () => {
        const {
            aPubHex, 
            bPubHex, 
            serviceA, 
            serviceB,
        } = await setup();

        const frame = await serviceA.seal(`msg ${randomUUID()}`, bPubHex, 'some-info');

        await expect(serviceB.open(frame, aPubHex)).rejects.toThrow();
    });

    it('fails to open with the wrong recipient key', async () => {
        const {
            aPubHex, 
            bPubHex, 
            serviceA, 
        } = await setup();

        const c = await generatePair();
        const serviceC = new CryptoService({ privateKey: await privHex(c) });

        const frame = await serviceA.seal(`msg ${randomUUID()}`, bPubHex);

        await expect(serviceC.open(frame, aPubHex)).rejects.toThrow();
    });

    it('throws when the frame salt/IV region is tampered', async () => {
        const {
            aPubHex, 
            bPubHex, 
            serviceA, 
            serviceB,
        } = await setup();

        const frame = await serviceA.seal(`msg ${randomUUID()}`, bPubHex);

        const i = Math.floor(frame.length / 2);
        const swapped = frame[i] === 'A' ? 'B' : 'A';
        const tampered = frame.slice(0, i) + swapped + frame.slice(i + 1);

        await expect(serviceB.open(tampered, aPubHex)).rejects.toThrow();
    });

    it('throws when the ciphertext/tag region is tampered', async () => {
        const {
            aPubHex, 
            bPubHex, 
            serviceA, 
            serviceB,
        } = await setup();

        const frame = await serviceA.seal(`msg ${randomUUID()}`, bPubHex);

        // last base64 char before any '=' padding lands in the GCM ciphertext/tag
        const i = frame.replace(/=+$/, '').length - 1;
        const swapped = frame[i] === 'A' ? 'B' : 'A';
        const tampered = frame.slice(0, i) + swapped + frame.slice(i + 1);

        await expect(serviceB.open(tampered, aPubHex)).rejects.toThrow();
    });

    it('throws the explicit kit error for a malformed/too-short frame', async () => {
        const { aPubHex, serviceB } = await setup();

        await expect(serviceB.open('AAAA', aPubHex)).rejects.toThrow('The sealed message frame is malformed.');
    });

    it('throws a clear error on seal when the private key is missing', async () => {
        const { bPubHex } = await setup();
        const service = new CryptoService({});

        await expect(service.seal('x', bPubHex)).rejects.toThrow(/NODE_PRIVATE_KEY is missing|not configured/i);
    });

    it('throws a clear error on open when the private key is missing', async () => {
        const {
            aPubHex, 
            bPubHex, 
            serviceA, 
        } = await setup();
        const frame = await serviceA.seal(`msg ${randomUUID()}`, bPubHex);

        const service = new CryptoService({});

        await expect(service.open(frame, aPubHex)).rejects.toThrow(/NODE_PRIVATE_KEY is missing|not configured/i);
    });

    it('throws a clear error when the private key is not hex', async () => {
        const { bPubHex } = await setup();
        const service = new CryptoService({ privateKey: 'not-hex-zz!!' });

        await expect(service.seal('x', bPubHex)).rejects.toThrow(/valid hex/i);
    });

    it('rejects seal when the private key is hex but not a valid PEM/DER key', async () => {
        const { bPubHex } = await setup();
        const service = new CryptoService({ privateKey: Buffer.from('not a pem', 'utf8').toString('hex') });

        await expect(service.seal('x', bPubHex)).rejects.toThrow();
    });

    it('throws a clear error when the recipient public key is not hex', async () => {
        const { serviceA } = await setup();

        await expect(serviceA.seal('x', 'zzzz-not-hex!!')).rejects.toThrow(/Peer public key.*valid hex|valid hex/i);
    });

    it('throws a clear error when the sender public key is not hex on open', async () => {
        const { serviceA } = await setup();

        await expect(serviceA.open('AAAA', 'zzzz-not-hex!!')).rejects.toThrow(/Peer public key.*valid hex|valid hex/i);
    });
});
