// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export class MemoryEncryption {
  private readonly algorithm = 'aes-256-gcm' as const;
  private readonly ivLength = 16;
  private readonly tagLength = 16;

  // In production, key comes from OS keychain via keyRef
  // This class NEVER stores or logs the key

  async encrypt(plaintext: string, key: Buffer): Promise<EncryptedPayload> {
    // Generate random IV for each encryption
    const iv = randomBytes(this.ivLength);
    const cipher = createCipheriv(this.algorithm, key, iv, { authTagLength: this.tagLength });

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      algorithm: this.algorithm,
    };
  }

  async decrypt(payload: EncryptedPayload, key: Buffer): Promise<string> {
    const iv = Buffer.from(payload.iv, 'hex');
    const authTag = Buffer.from(payload.authTag, 'hex');
    const decipher = createDecipheriv(this.algorithm, key, iv, { authTagLength: this.tagLength });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(payload.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  algorithm: string;
}
