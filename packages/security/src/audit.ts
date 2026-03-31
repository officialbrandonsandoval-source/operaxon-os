// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

import { createHmac } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AuditEntry } from '@operaxon/types';

export class AuditLog {
  private readonly logPath: string;
  private readonly signingKey: Buffer;
  private previousHash: string = '';

  constructor(basePath: string, signingKey: Buffer) {
    this.logPath = join(basePath, 'audit.log');
    this.signingKey = signingKey;
  }

  async append(entry: Omit<AuditEntry, 'id' | 'signature'>): Promise<AuditEntry> {
    const id = crypto.randomUUID();
    const signature = this.sign({ ...entry, id, previousHash: this.previousHash });

    const fullEntry: AuditEntry = {
      ...entry,
      id,
      signature,
    };

    const line = JSON.stringify(fullEntry) + '\n';
    await appendFile(this.logPath, line, 'utf8');
    this.previousHash = signature;

    return fullEntry;
  }

  private sign(data: Record<string, unknown>): string {
    const hmac = createHmac('sha256', this.signingKey);
    hmac.update(JSON.stringify(data));
    return hmac.digest('hex');
  }

  async verify(): Promise<{ valid: boolean; invalidEntries: string[] }> {
    const content = await readFile(this.logPath, 'utf8');
    const lines = content.trim().split('\n').filter(l => l.length > 0);
    const invalidEntries: string[] = [];
    let prevHash = '';

    for (const line of lines) {
      const entry = JSON.parse(line) as AuditEntry;
      const { signature, ...rest } = entry;
      const expected = this.sign({ ...rest, previousHash: prevHash });

      if (signature !== expected) {
        invalidEntries.push(entry.id);
      }
      prevHash = signature;
    }

    return { valid: invalidEntries.length === 0, invalidEntries };
  }
}
