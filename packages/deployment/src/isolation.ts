// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * isolation.ts — Namespace isolation for multi-tenant deployments
 * Ensures data, agents, cron jobs, and memory cannot cross tenant boundaries.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Isolation namespace ──────────────────────────────────────────────────────

export interface TenantNamespace {
  tenantId: string;

  // Namespaced keys for all external resources
  memoryNamespace: string;       // e.g. "tenant_abc123:memory"
  agentNamespace: string;        // e.g. "tenant_abc123:agents"
  cronNamespace: string;         // e.g. "tenant_abc123:cron"
  sessionNamespace: string;      // e.g. "tenant_abc123:sessions"
  channelNamespace: string;      // e.g. "tenant_abc123:channels"
  auditNamespace: string;        // e.g. "tenant_abc123:audit"

  // Paths
  rootDir: string;
  memoryDir: string;
  logsDir: string;
  auditDir: string;
  tempDir: string;
}

// ─── IsolationManager ─────────────────────────────────────────────────────────

export class IsolationManager {
  private baseDir: string;
  private namespaces: Map<string, TenantNamespace> = new Map();

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  // Create full namespace for a tenant
  createNamespace(tenantId: string): TenantNamespace {
    const rootDir = path.join(this.baseDir, tenantId);
    const ns: TenantNamespace = {
      tenantId,
      memoryNamespace: `${tenantId}:memory`,
      agentNamespace: `${tenantId}:agents`,
      cronNamespace: `${tenantId}:cron`,
      sessionNamespace: `${tenantId}:sessions`,
      channelNamespace: `${tenantId}:channels`,
      auditNamespace: `${tenantId}:audit`,
      rootDir,
      memoryDir: path.join(rootDir, 'meridian'),
      logsDir: path.join(rootDir, 'logs'),
      auditDir: path.join(rootDir, 'audit'),
      tempDir: path.join(rootDir, 'tmp'),
    };

    // Create all directories
    for (const dir of [ns.memoryDir, ns.logsDir, ns.auditDir, ns.tempDir]) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write namespace manifest (used by isolation checks)
    fs.writeFileSync(
      path.join(rootDir, 'namespace.json'),
      JSON.stringify({ ...ns, createdAt: new Date().toISOString() }, null, 2),
      'utf-8'
    );

    this.namespaces.set(tenantId, ns);
    return ns;
  }

  getNamespace(tenantId: string): TenantNamespace | undefined {
    if (this.namespaces.has(tenantId)) {
      return this.namespaces.get(tenantId);
    }

    // Try loading from disk
    const manifestPath = path.join(this.baseDir, tenantId, 'namespace.json');
    if (fs.existsSync(manifestPath)) {
      const ns = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as TenantNamespace;
      this.namespaces.set(tenantId, ns);
      return ns;
    }

    return undefined;
  }

  // ─── Path isolation ──────────────────────────────────────────────────────────

  // Resolve a path within a tenant's namespace — prevents path traversal
  resolvePath(tenantId: string, relativePath: string): string {
    const ns = this.getNamespace(tenantId);
    if (!ns) throw new Error(`Unknown tenant: ${tenantId}`);

    const resolved = path.resolve(ns.rootDir, relativePath);

    // Strict containment: resolved path must stay under tenant root
    if (!resolved.startsWith(ns.rootDir)) {
      throw new Error(
        `Path traversal detected: "${relativePath}" resolves outside tenant namespace`
      );
    }

    return resolved;
  }

  // ─── Key isolation ────────────────────────────────────────────────────────────

  // Namespace any storage key to prevent cross-tenant access
  namespaceKey(tenantId: string, key: string): string {
    return `${tenantId}:${key}`;
  }

  // Verify that a namespaced key belongs to the expected tenant
  verifyKeyOwnership(tenantId: string, namespacedKey: string): boolean {
    return namespacedKey.startsWith(`${tenantId}:`);
  }

  // Strip namespace prefix from a key
  stripNamespace(tenantId: string, namespacedKey: string): string {
    const prefix = `${tenantId}:`;
    if (!namespacedKey.startsWith(prefix)) {
      throw new Error(`Key "${namespacedKey}" does not belong to tenant ${tenantId}`);
    }
    return namespacedKey.slice(prefix.length);
  }

  // ─── Agent isolation ─────────────────────────────────────────────────────────

  // Returns a namespaced agent ID — prevents cross-tenant agent access
  namespaceAgentId(tenantId: string, agentId: string): string {
    return `${tenantId}:agent:${agentId}`;
  }

  // Returns a namespaced cron job ID
  namespaceCronJob(tenantId: string, jobId: string): string {
    return `${tenantId}:cron:${jobId}`;
  }

  // Returns a namespaced session ID
  namespaceSession(tenantId: string, sessionId: string): string {
    return `${tenantId}:session:${sessionId}`;
  }

  // ─── Isolation audit ─────────────────────────────────────────────────────────

  logAccess(tenantId: string, resource: string, action: string, actor: string): void {
    const ns = this.getNamespace(tenantId);
    if (!ns) return;

    const entry = {
      timestamp: new Date().toISOString(),
      tenantId,
      resource,
      action,
      actor,
    };

    const logFile = path.join(ns.auditDir, `access-${new Date().toISOString().slice(0, 10)}.jsonl`);
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf-8');
  }

  // Verify no cross-contamination — check a target tenant's data dir
  // for any files belonging to another tenant
  verifyCrossContamination(tenantId: string): { clean: boolean; violations: string[] } {
    const ns = this.getNamespace(tenantId);
    if (!ns) return { clean: true, violations: [] };

    const violations: string[] = [];

    // Check all files in memory dir for wrong tenant markers
    const checkDir = (dir: string): void => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        try {
          if (fs.statSync(fullPath).isFile() && entry.endsWith('.json')) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const parsed = JSON.parse(content);
            if (parsed.tenantId && parsed.tenantId !== tenantId) {
              violations.push(`${fullPath}: contains data for tenant ${parsed.tenantId}`);
            }
          }
        } catch {
          // skip unreadable files
        }
      }
    };

    checkDir(ns.memoryDir);
    checkDir(ns.logsDir);

    return { clean: violations.length === 0, violations };
  }
}
