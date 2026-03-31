// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

import {
  readFile,
  writeFile,
  rename,
  readdir,
  unlink,
  mkdir,
  stat,
} from 'node:fs/promises';
import { join, extname, basename, relative } from 'node:path';
import type {
  MeridianConfig,
  MemoryEntry,
  MemoryType,
} from '@operaxon/types';
import {
  MemoryEncryption,
  KeychainManager,
  type EncryptedPayload,
} from '@operaxon/security';

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

interface MemoryFrontmatter {
  id: string;
  type: MemoryType;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

const FRONTMATTER_DELIMITER = '---';

function parseFrontmatter(raw: string): { frontmatter: MemoryFrontmatter; content: string } {
  const lines = raw.split('\n');

  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) {
    throw new MemoryStoreError('Missing frontmatter delimiter at start of file');
  }

  const endIndex = lines.indexOf(FRONTMATTER_DELIMITER, 1);
  if (endIndex === -1) {
    throw new MemoryStoreError('Missing closing frontmatter delimiter');
  }

  const fmLines = lines.slice(1, endIndex);
  const fm: Record<string, string> = {};

  for (const line of fmLines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    fm[key] = value;
  }

  // Validate required fields
  const required: Array<keyof MemoryFrontmatter> = [
    'id', 'type', 'name', 'description', 'createdAt', 'updatedAt',
  ];
  for (const field of required) {
    if (!fm[field]) {
      throw new MemoryStoreError(`Missing required frontmatter field: ${field}`);
    }
  }

  const frontmatter: MemoryFrontmatter = {
    id: fm['id'] as string,
    type: fm['type'] as MemoryType,
    name: fm['name'] as string,
    description: fm['description'] as string,
    createdAt: fm['createdAt'] as string,
    updatedAt: fm['updatedAt'] as string,
  };

  const content = lines.slice(endIndex + 1).join('\n').trim();

  return { frontmatter, content };
}

function serializeFrontmatter(fm: MemoryFrontmatter, content: string): string {
  const lines: string[] = [
    FRONTMATTER_DELIMITER,
    `id: ${fm.id}`,
    `type: ${fm.type}`,
    `name: ${fm.name}`,
    `description: ${fm.description}`,
    `createdAt: ${fm.createdAt}`,
    `updatedAt: ${fm.updatedAt}`,
    FRONTMATTER_DELIMITER,
    '',
    content,
    '', // trailing newline
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// MemoryStore — the primary interface for memory file operations
// ---------------------------------------------------------------------------

export class MemoryStore {
  private readonly storagePath: string;
  private readonly memoryDir: string;
  private readonly indexPath: string;
  private readonly encryption: MemoryEncryption;
  private readonly keychain: KeychainManager;
  private readonly encryptionKeyRef: string;
  private encryptionKey: Buffer | null = null;

  constructor(config: Pick<MeridianConfig, 'storagePath' | 'encryptionKeyRef'>) {
    this.storagePath = config.storagePath;
    this.memoryDir = join(config.storagePath, 'memories');
    this.indexPath = join(config.storagePath, 'MEMORY.md');
    this.encryption = new MemoryEncryption();
    this.keychain = new KeychainManager();
    this.encryptionKeyRef = config.encryptionKeyRef;
  }

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------

  async initialize(): Promise<void> {
    await mkdir(this.memoryDir, { recursive: true });
    this.encryptionKey = await this.keychain.getKey(this.encryptionKeyRef);
  }

  private getKey(): Buffer {
    if (this.encryptionKey === null) {
      throw new MemoryStoreError(
        'MemoryStore not initialized — call initialize() before performing operations',
      );
    }
    return this.encryptionKey;
  }

  // -----------------------------------------------------------------------
  // MEMORY.md index operations
  // -----------------------------------------------------------------------

  /**
   * Reads the MEMORY.md index file and returns its raw content.
   * Returns an empty string if the file does not yet exist.
   */
  async readMemoryIndex(): Promise<string> {
    try {
      return await readFile(this.indexPath, 'utf8');
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        return '';
      }
      throw err;
    }
  }

  /**
   * Writes the MEMORY.md index file atomically.
   * Content is written to a temporary file first, then renamed.
   */
  async writeMemoryIndex(content: string): Promise<void> {
    await this.atomicWrite(this.indexPath, content);
  }

  /**
   * Returns the line count of MEMORY.md.
   */
  async getMemoryIndexLineCount(): Promise<number> {
    const content = await this.readMemoryIndex();
    if (content.length === 0) return 0;
    return content.split('\n').length;
  }

  // -----------------------------------------------------------------------
  // Individual memory file operations
  // -----------------------------------------------------------------------

  /**
   * Reads a single memory file, decrypts it, and parses its frontmatter.
   */
  async readMemoryFile(fileId: string): Promise<MemoryEntry> {
    const filePath = this.memoryFilePath(fileId);

    const encryptedRaw = await readFile(filePath, 'utf8');
    const payload = JSON.parse(encryptedRaw) as EncryptedPayload;
    const decrypted = await this.encryption.decrypt(payload, this.getKey());

    const { frontmatter, content } = parseFrontmatter(decrypted);

    return {
      ...frontmatter,
      content,
      filePath: relative(this.storagePath, filePath),
    };
  }

  /**
   * Writes a memory file atomically. Content is encrypted before writing.
   *
   * Flow: serialize -> encrypt -> write .tmp -> rename
   */
  async writeMemoryFile(entry: MemoryEntry): Promise<void> {
    const filePath = this.memoryFilePath(entry.id);

    const fm: MemoryFrontmatter = {
      id: entry.id,
      type: entry.type,
      name: entry.name,
      description: entry.description,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };

    const plaintext = serializeFrontmatter(fm, entry.content);
    const encrypted = await this.encryption.encrypt(plaintext, this.getKey());
    const raw = JSON.stringify(encrypted, null, 2);

    await this.atomicWrite(filePath, raw);
  }

  /**
   * Lists all memory files and returns their parsed entries.
   * Files that fail to parse are skipped (logged but not thrown).
   */
  async listMemoryFiles(): Promise<MemoryEntry[]> {
    let files: string[];
    try {
      files = await readdir(this.memoryDir);
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        return [];
      }
      throw err;
    }

    const memoryFiles = files.filter(f => extname(f) === '.mem');
    const entries: MemoryEntry[] = [];

    for (const file of memoryFiles) {
      const fileId = basename(file, '.mem');
      try {
        const entry = await this.readMemoryFile(fileId);
        entries.push(entry);
      } catch {
        // Skip corrupted files — a future prune cycle will handle them
        continue;
      }
    }

    return entries;
  }

  /**
   * Deletes a memory file by its ID.
   * Returns `true` if deleted, `false` if the file did not exist.
   */
  async deleteMemoryFile(fileId: string): Promise<boolean> {
    const filePath = this.memoryFilePath(fileId);
    try {
      await unlink(filePath);
      return true;
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        return false;
      }
      throw err;
    }
  }

  /**
   * Checks whether a memory file exists.
   */
  async memoryFileExists(fileId: string): Promise<boolean> {
    try {
      await stat(this.memoryFilePath(fileId));
      return true;
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        return false;
      }
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // State persistence (for gate checks)
  // -----------------------------------------------------------------------

  private get statePath(): string {
    return join(this.storagePath, 'meridian-state.json');
  }

  async readState(): Promise<import('@operaxon/types').MeridianState> {
    try {
      const raw = await readFile(this.statePath, 'utf8');
      return JSON.parse(raw) as import('@operaxon/types').MeridianState;
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        return {
          lastConsolidation: null,
          sessionsSinceLastConsolidation: 0,
          isLocked: false,
          lockHolder: null,
          lockAcquiredAt: null,
        };
      }
      throw err;
    }
  }

  async writeState(state: import('@operaxon/types').MeridianState): Promise<void> {
    const raw = JSON.stringify(state, null, 2);
    await this.atomicWrite(this.statePath, raw);
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private memoryFilePath(fileId: string): string {
    // Sanitize fileId — only allow alphanumeric, dashes, and underscores
    if (!/^[a-zA-Z0-9_-]+$/.test(fileId)) {
      throw new MemoryStoreError(`Invalid memory file ID: "${fileId}"`);
    }
    return join(this.memoryDir, `${fileId}.mem`);
  }

  /**
   * Writes data atomically by writing to a .tmp file first, then renaming.
   * This prevents partial writes from corrupting existing files.
   */
  private async atomicWrite(targetPath: string, data: string): Promise<void> {
    const tmpPath = targetPath + '.tmp';
    await writeFile(tmpPath, data, 'utf8');
    await rename(tmpPath, targetPath);
  }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class MemoryStoreError extends Error {
  override readonly name = 'MemoryStoreError';
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

interface NodeError extends Error {
  code?: string;
}

function isNodeError(err: unknown): err is NodeError {
  return err instanceof Error && 'code' in err;
}

// Re-export parsing utilities for use in engine phases
export { parseFrontmatter, serializeFrontmatter, type MemoryFrontmatter };
