// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomBytes } from 'node:crypto';
import { MemoryEncryption } from './encryption.js';
import type { EncryptedPayload } from './encryption.js';

describe('MemoryEncryption', () => {
  const enc = new MemoryEncryption();

  function validKey(): Buffer {
    return randomBytes(32); // AES-256 requires 32-byte key
  }

  it('encrypt then decrypt returns original plaintext', async () => {
    const key = validKey();
    const plaintext = 'sensitive agent memory content';
    const payload = await enc.encrypt(plaintext, key);
    const result = await enc.decrypt(payload, key);
    assert.equal(result, plaintext);
  });

  it('different keys produce different ciphertext', async () => {
    const key1 = validKey();
    const key2 = validKey();
    const plaintext = 'identical plaintext for both';
    const payload1 = await enc.encrypt(plaintext, key1);
    const payload2 = await enc.encrypt(plaintext, key2);
    assert.notEqual(payload1.ciphertext, payload2.ciphertext);
  });

  it('tampering with ciphertext causes decryption failure', async () => {
    const key = validKey();
    const payload = await enc.encrypt('secret data', key);

    // Flip a character in the ciphertext
    const tampered: EncryptedPayload = {
      ...payload,
      ciphertext: payload.ciphertext.slice(0, -2) + 'ff',
    };

    await assert.rejects(
      () => enc.decrypt(tampered, key),
      (err: Error) => {
        assert.ok(err instanceof Error);
        return true;
      },
    );
  });

  it('tampering with authTag causes decryption failure', async () => {
    const key = validKey();
    const payload = await enc.encrypt('secret data', key);

    const tampered: EncryptedPayload = {
      ...payload,
      authTag: 'a'.repeat(payload.authTag.length),
    };

    await assert.rejects(
      () => enc.decrypt(tampered, key),
      (err: Error) => {
        assert.ok(err instanceof Error);
        return true;
      },
    );
  });

  it('tampering with IV causes decryption failure', async () => {
    const key = validKey();
    const payload = await enc.encrypt('secret data', key);

    const tampered: EncryptedPayload = {
      ...payload,
      iv: 'b'.repeat(payload.iv.length),
    };

    await assert.rejects(
      () => enc.decrypt(tampered, key),
      (err: Error) => {
        assert.ok(err instanceof Error);
        return true;
      },
    );
  });

  it('each encryption produces unique IV (no IV reuse)', async () => {
    const key = validKey();
    const plaintext = 'same message encrypted twice';
    const payload1 = await enc.encrypt(plaintext, key);
    const payload2 = await enc.encrypt(plaintext, key);
    assert.notEqual(payload1.iv, payload2.iv);
  });

  it('empty string encryption/decryption', async () => {
    const key = validKey();
    const payload = await enc.encrypt('', key);
    const result = await enc.decrypt(payload, key);
    assert.equal(result, '');
  });

  it('large payload encryption/decryption', async () => {
    const key = validKey();
    const plaintext = 'X'.repeat(1_000_000); // 1 MB of text
    const payload = await enc.encrypt(plaintext, key);
    const result = await enc.decrypt(payload, key);
    assert.equal(result, plaintext);
  });

  it('wrong key length throws', async () => {
    const shortKey = randomBytes(16); // too short for AES-256
    await assert.rejects(
      () => enc.encrypt('data', shortKey),
      (err: Error) => {
        assert.ok(err instanceof Error);
        return true;
      },
    );
  });

  it('decrypting with wrong key fails', async () => {
    const key1 = validKey();
    const key2 = validKey();
    const payload = await enc.encrypt('secret', key1);
    await assert.rejects(
      () => enc.decrypt(payload, key2),
      (err: Error) => {
        assert.ok(err instanceof Error);
        return true;
      },
    );
  });

  it('payload contains expected algorithm field', async () => {
    const key = validKey();
    const payload = await enc.encrypt('test', key);
    assert.equal(payload.algorithm, 'aes-256-gcm');
  });
});
