// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:os';
import { randomBytes } from 'node:crypto';

const execFileAsync = promisify(execFile);

const SERVICE_NAME = 'operaxon-os';

export class KeychainManager {
  private readonly platform: string;

  constructor() {
    this.platform = platform();
  }

  async getKey(keyName: string): Promise<Buffer> {
    if (this.platform === 'darwin') {
      return this.getMacOSKey(keyName);
    }
    // Linux fallback — read from protected file
    return this.getLinuxKey(keyName);
  }

  async setKey(keyName: string, key: Buffer): Promise<void> {
    if (this.platform === 'darwin') {
      return this.setMacOSKey(keyName, key);
    }
    return this.setLinuxKey(keyName, key);
  }

  async generateAndStoreKey(keyName: string): Promise<Buffer> {
    const key = randomBytes(32); // 256 bits for AES-256
    await this.setKey(keyName, key);
    return key;
  }

  private async getMacOSKey(keyName: string): Promise<Buffer> {
    const { stdout } = await execFileAsync('security', [
      'find-generic-password',
      '-s', SERVICE_NAME,
      '-a', keyName,
      '-w',
    ]);
    return Buffer.from(stdout.trim(), 'hex');
  }

  private async setMacOSKey(keyName: string, key: Buffer): Promise<void> {
    // Delete existing entry if present (ignore errors)
    try {
      await execFileAsync('security', [
        'delete-generic-password',
        '-s', SERVICE_NAME,
        '-a', keyName,
      ]);
    } catch {
      // Key may not exist yet — that's fine
    }

    await execFileAsync('security', [
      'add-generic-password',
      '-s', SERVICE_NAME,
      '-a', keyName,
      '-w', key.toString('hex'),
      '-U',
    ]);
  }

  private async getLinuxKey(keyName: string): Promise<Buffer> {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { homedir } = await import('node:os');
    const keyPath = join(homedir(), '.operaxon', 'keys', keyName);
    const content = await readFile(keyPath, 'utf8');
    return Buffer.from(content.trim(), 'hex');
  }

  private async setLinuxKey(keyName: string, key: Buffer): Promise<void> {
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { homedir } = await import('node:os');
    const keyDir = join(homedir(), '.operaxon', 'keys');
    await mkdir(keyDir, { recursive: true, mode: 0o700 });
    const keyPath = join(keyDir, keyName);
    await writeFile(keyPath, key.toString('hex'), { mode: 0o600 });
  }
}
