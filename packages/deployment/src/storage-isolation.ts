// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * storage-isolation.ts — Per-tenant memory and log isolation
 * Each tenant's MERIDIAN and GOVERNOR data is fully isolated.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Isolated storage accessor ────────────────────────────────────────────────

export class TenantStorage {
  private tenantId: string;
  private baseDir: string;

  constructor(tenantId: string, baseDir: string) {
    this.tenantId = tenantId;
    // All paths enforced under baseDir/tenantId
    this.baseDir = path.join(baseDir, tenantId);
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  // ─── Path helpers ─────────────────────────────────────────────────────────────

  private resolveSafe(relativePath: string): string {
    const resolved = path.resolve(this.baseDir, relativePath);
    if (!resolved.startsWith(this.baseDir)) {
      throw new Error(
        `[TenantStorage:${this.tenantId}] Path traversal attempt: ${relativePath}`
      );
    }
    return resolved;
  }

  // ─── Memory (MERIDIAN) store ──────────────────────────────────────────────────

  get meridianDir(): string {
    const dir = path.join(this.baseDir, 'meridian');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  readMemory(key: string): string | null {
    const filePath = this.resolveSafe(path.join('meridian', `${key}.json`));
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  }

  writeMemory(key: string, value: string): void {
    const dir = path.join(this.baseDir, 'meridian');
    fs.mkdirSync(dir, { recursive: true });
    const filePath = this.resolveSafe(path.join('meridian', `${key}.json`));
    fs.writeFileSync(filePath, value, 'utf-8');
  }

  deleteMemory(key: string): void {
    const filePath = this.resolveSafe(path.join('meridian', `${key}.json`));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  listMemoryKeys(): string[] {
    const dir = path.join(this.baseDir, 'meridian');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  }

  searchMemory(query: string): Array<{ key: string; snippet: string }> {
    const results: Array<{ key: string; snippet: string }> = [];
    const keys = this.listMemoryKeys();
    const lowerQuery = query.toLowerCase();

    for (const key of keys) {
      const content = this.readMemory(key);
      if (content && content.toLowerCase().includes(lowerQuery)) {
        const idx = content.toLowerCase().indexOf(lowerQuery);
        const start = Math.max(0, idx - 50);
        const end = Math.min(content.length, idx + 150);
        results.push({ key, snippet: `...${content.slice(start, end)}...` });
      }
    }

    return results;
  }

  // ─── Logs ─────────────────────────────────────────────────────────────────────

  appendLog(logName: string, entry: Record<string, unknown>): void {
    const dir = path.join(this.baseDir, 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const filePath = this.resolveSafe(path.join('logs', `${logName}.jsonl`));
    fs.appendFileSync(filePath, JSON.stringify({ ...entry, tenantId: this.tenantId }) + '\n', 'utf-8');
  }

  readLogs(logName: string, limit = 100): Array<Record<string, unknown>> {
    const filePath = this.resolveSafe(path.join('logs', `${logName}.jsonl`));
    if (!fs.existsSync(filePath)) return [];

    const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean);
    return lines
      .slice(-limit)
      .map(line => {
        try { return JSON.parse(line); }
        catch { return { raw: line }; }
      });
  }

  // ─── Audit trail ──────────────────────────────────────────────────────────────

  appendAudit(event: {
    actor: string;
    action: string;
    resource: string;
    outcome: 'success' | 'failure' | 'pending';
    metadata?: Record<string, unknown>;
  }): void {
    const today = new Date().toISOString().slice(0, 10);
    this.appendLog(`audit-${today}`, {
      timestamp: new Date().toISOString(),
      ...event,
    });
  }

  readAuditLog(date?: string): Array<Record<string, unknown>> {
    const target = date ?? new Date().toISOString().slice(0, 10);
    return this.readLogs(`audit-${target}`, 500);
  }

  // ─── GOVERNOR per-tenant ──────────────────────────────────────────────────────

  writeGovernorState(state: Record<string, unknown>): void {
    const filePath = this.resolveSafe('governor-state.json');
    fs.writeFileSync(filePath, JSON.stringify({ ...state, tenantId: this.tenantId }, null, 2), 'utf-8');
  }

  readGovernorState(): Record<string, unknown> | null {
    const filePath = this.resolveSafe('governor-state.json');
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  // ─── Usage counters ───────────────────────────────────────────────────────────

  incrementUsage(metric: string, delta = 1): void {
    const filePath = this.resolveSafe('usage.json');
    let usage: Record<string, number> = {};
    if (fs.existsSync(filePath)) {
      usage = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    usage[metric] = (usage[metric] ?? 0) + delta;
    usage['_lastUpdated'] = Date.now();
    fs.writeFileSync(filePath, JSON.stringify(usage, null, 2), 'utf-8');
  }

  readUsage(): Record<string, number> {
    const filePath = this.resolveSafe('usage.json');
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  // ─── Storage stats ────────────────────────────────────────────────────────────

  stats(): { totalFiles: number; totalBytes: number; memoryKeys: number } {
    let totalFiles = 0;
    let totalBytes = 0;

    const walk = (dir: string): void => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
        } else {
          totalFiles++;
          totalBytes += stat.size;
        }
      }
    };

    walk(this.baseDir);
    const memoryKeys = this.listMemoryKeys().length;

    return { totalFiles, totalBytes, memoryKeys };
  }
}

// ─── StorageRegistry — manages all tenant storage instances ──────────────────

export class StorageRegistry {
  private baseDir: string;
  private instances: Map<string, TenantStorage> = new Map();

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  for(tenantId: string): TenantStorage {
    if (!this.instances.has(tenantId)) {
      this.instances.set(tenantId, new TenantStorage(tenantId, this.baseDir));
    }
    return this.instances.get(tenantId)!;
  }

  release(tenantId: string): void {
    this.instances.delete(tenantId);
  }

  listTenants(): string[] {
    if (!fs.existsSync(this.baseDir)) return [];
    return fs.readdirSync(this.baseDir).filter(entry => {
      return fs.statSync(path.join(this.baseDir, entry)).isDirectory();
    });
  }
}
