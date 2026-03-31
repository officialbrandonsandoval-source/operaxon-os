// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * tenant-manager.ts — Create, list, and delete tenant instances
 * Each tenant gets: isolated port, isolated memory, isolated agent set, isolated permissions
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

// ─── Tenant record ────────────────────────────────────────────────────────────

export type TenantStatus =
  | 'provisioned'    // config generated, not yet deployed
  | 'deploying'      // deployment in progress
  | 'running'        // live and healthy
  | 'degraded'       // running but unhealthy
  | 'stopped'        // cleanly stopped
  | 'failed'         // deployment or runtime failure
  | 'terminated';    // permanently deleted

export interface TenantRecord {
  id: string;                   // "tenant_abc123"
  customerId: string;
  instanceName: string;         // "operaxon-abc123" — Docker/Fly.io app name
  port: number;
  status: TenantStatus;
  createdAt: string;
  updatedAt: string;

  // Paths (all scoped to tenant)
  configDir: string;
  dataDir: string;
  memoryDir: string;
  logsDir: string;

  // Runtime
  pid?: number;                 // process ID if running locally
  instanceUrl?: string;         // https://operaxon-abc123.fly.io
  lastHealthCheck?: string;     // ISO 8601
  healthCheckPassed?: boolean;

  // Metadata
  tier: string;
  deploymentTarget: string;
  agentCount: number;
}

// ─── TenantManager ────────────────────────────────────────────────────────────

export class TenantManager {
  private storePath: string;
  private baseDataDir: string;
  private tenants: Map<string, TenantRecord> = new Map();

  constructor(storePath: string, baseDataDir: string) {
    this.storePath = storePath;
    this.baseDataDir = baseDataDir;
    this.load();
  }

  private load(): void {
    if (fs.existsSync(this.storePath)) {
      const raw = fs.readFileSync(this.storePath, 'utf-8');
      const records: TenantRecord[] = JSON.parse(raw);
      for (const r of records) {
        this.tenants.set(r.id, r);
      }
    }
  }

  private save(): void {
    const dir = path.dirname(this.storePath);
    fs.mkdirSync(dir, { recursive: true });
    const records = Array.from(this.tenants.values());
    fs.writeFileSync(this.storePath, JSON.stringify(records, null, 2), 'utf-8');
  }

  // ─── Create ──────────────────────────────────────────────────────────────────

  create(opts: {
    customerId: string;
    tenantId: string;
    port: number;
    tier: string;
    deploymentTarget: string;
    agentCount: number;
    configDir: string;
  }): TenantRecord {
    if (this.tenants.has(opts.tenantId)) {
      throw new Error(`Tenant already exists: ${opts.tenantId}`);
    }

    const portConflict = Array.from(this.tenants.values()).find(t =>
      t.port === opts.port && t.status !== 'terminated'
    );
    if (portConflict) {
      throw new Error(`Port ${opts.port} already in use by tenant ${portConflict.id}`);
    }

    const now = new Date().toISOString();
    const instanceName = `operaxon-${opts.tenantId.replace('tenant_', '')}`;

    // Create tenant-scoped directories
    const dataDir = path.join(this.baseDataDir, opts.tenantId, 'data');
    const memoryDir = path.join(this.baseDataDir, opts.tenantId, 'meridian');
    const logsDir = path.join(this.baseDataDir, opts.tenantId, 'logs');

    for (const dir of [dataDir, memoryDir, logsDir]) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write tenant isolation marker (prevents cross-tenant access)
    const isolationMarker = {
      tenantId: opts.tenantId,
      customerId: opts.customerId,
      createdAt: now,
      dataClass: 'tenant-isolated',
    };
    fs.writeFileSync(
      path.join(dataDir, '.tenant-isolation'),
      JSON.stringify(isolationMarker, null, 2),
      'utf-8'
    );

    const record: TenantRecord = {
      id: opts.tenantId,
      customerId: opts.customerId,
      instanceName,
      port: opts.port,
      status: 'provisioned',
      createdAt: now,
      updatedAt: now,
      configDir: opts.configDir,
      dataDir,
      memoryDir,
      logsDir,
      tier: opts.tier,
      deploymentTarget: opts.deploymentTarget,
      agentCount: opts.agentCount,
    };

    this.tenants.set(opts.tenantId, record);
    this.save();
    return record;
  }

  // ─── Read ────────────────────────────────────────────────────────────────────

  get(tenantId: string): TenantRecord | undefined {
    return this.tenants.get(tenantId);
  }

  getByCustomerId(customerId: string): TenantRecord | undefined {
    return Array.from(this.tenants.values()).find(t => t.customerId === customerId);
  }

  list(filter?: { status?: TenantStatus }): TenantRecord[] {
    let results = Array.from(this.tenants.values());
    if (filter?.status) results = results.filter(t => t.status === filter.status);
    return results;
  }

  getActivePorts(): Set<number> {
    const ports = new Set<number>();
    for (const t of this.tenants.values()) {
      if (t.status !== 'terminated') ports.add(t.port);
    }
    return ports;
  }

  // ─── Update ──────────────────────────────────────────────────────────────────

  updateStatus(tenantId: string, status: TenantStatus): TenantRecord {
    return this.update(tenantId, { status });
  }

  setInstanceUrl(tenantId: string, url: string): TenantRecord {
    return this.update(tenantId, { instanceUrl: url });
  }

  recordHealthCheck(tenantId: string, passed: boolean): TenantRecord {
    return this.update(tenantId, {
      lastHealthCheck: new Date().toISOString(),
      healthCheckPassed: passed,
      status: passed ? 'running' : 'degraded',
    });
  }

  update(tenantId: string, patch: Partial<TenantRecord>): TenantRecord {
    const existing = this.tenants.get(tenantId);
    if (!existing) throw new Error(`Tenant not found: ${tenantId}`);
    const updated: TenantRecord = {
      ...existing,
      ...patch,
      id: existing.id,
      customerId: existing.customerId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.tenants.set(tenantId, updated);
    this.save();
    return updated;
  }

  // ─── Delete ──────────────────────────────────────────────────────────────────

  terminate(tenantId: string, purgeData = false): void {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new Error(`Tenant not found: ${tenantId}`);

    this.update(tenantId, { status: 'terminated' });

    if (purgeData) {
      // Remove all tenant data — irreversible
      const tenantBaseDir = path.join(this.baseDataDir, tenantId);
      if (fs.existsSync(tenantBaseDir)) {
        fs.rmSync(tenantBaseDir, { recursive: true, force: true });
      }
    }
  }

  // ─── Stats ───────────────────────────────────────────────────────────────────

  stats(): {
    total: number;
    running: number;
    deploying: number;
    failed: number;
    terminated: number;
  } {
    const all = Array.from(this.tenants.values());
    return {
      total: all.length,
      running: all.filter(t => t.status === 'running').length,
      deploying: all.filter(t => t.status === 'deploying').length,
      failed: all.filter(t => t.status === 'failed').length,
      terminated: all.filter(t => t.status === 'terminated').length,
    };
  }
}
