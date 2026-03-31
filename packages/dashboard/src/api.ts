// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * api.ts — Customer dashboard REST API
 *
 * Endpoints:
 *   GET  /dashboard/health             — API health check
 *   GET  /dashboard/agents             — List running agents
 *   GET  /dashboard/agents/:id         — Agent detail
 *   GET  /dashboard/memory             — Memory summary
 *   GET  /dashboard/memory/search?q=   — Search agent memory
 *   GET  /dashboard/audit              — Audit trail
 *   GET  /dashboard/usage              — Usage metrics
 *   GET  /dashboard/billing            — Billing summary + invoices
 *   GET  /dashboard/status             — Onboarding/deployment status
 *   POST /dashboard/settings/channels  — Update channel config
 *
 * All endpoints require: Authorization: Bearer ox_live_...
 */

import * as http from 'node:http';
import * as url from 'node:url';
import { DashboardAuth } from './auth.js';
import { TenantStorage, StorageRegistry } from '@operaxon/deployment';
import { UsageTracker } from '@operaxon/billing';

// ─── API context ──────────────────────────────────────────────────────────────

export interface DashboardApiOptions {
  port: number;
  auth: DashboardAuth;
  storageRegistry: StorageRegistry;
  usageTracker: UsageTracker;
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function json(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'X-Operaxon-Version': '1.0.0',
  });
  res.end(body);
}

function unauthorized(res: http.ServerResponse, message = 'Unauthorized'): void {
  json(res, 401, { error: message });
}

function notFound(res: http.ServerResponse): void {
  json(res, 404, { error: 'Not found' });
}

// ─── DashboardApi ─────────────────────────────────────────────────────────────

export class DashboardApi {
  private opts: DashboardApiOptions;
  private server: http.Server;

  constructor(opts: DashboardApiOptions) {
    this.opts = opts;
    this.server = http.createServer((req, res) => this.handle(req, res));
  }

  start(): Promise<void> {
    return new Promise(resolve => {
      this.server.listen(this.opts.port, () => {
        console.log(`[Dashboard] API listening on port ${this.opts.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close(err => err ? reject(err) : resolve());
    });
  }

  // ─── Request router ───────────────────────────────────────────────────────────

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const parsed = url.parse(req.url ?? '/', true);
    const pathname = parsed.pathname ?? '/';

    // Health check (unauthenticated)
    if (pathname === '/dashboard/health' && req.method === 'GET') {
      json(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
      return;
    }

    // All other endpoints require auth
    const auth = this.opts.auth.verifyHeader(req.headers.authorization);
    if (!auth.authenticated) {
      unauthorized(res, auth.error);
      return;
    }

    const tenantId = auth.tenantId!;
    const storage = this.opts.storageRegistry.for(tenantId);

    // Track API call usage
    this.opts.usageTracker.trackApiCall(tenantId, pathname);

    try {
      // Route
      if (pathname === '/dashboard/agents' && req.method === 'GET') {
        await this.handleAgents(res, tenantId, storage);
      } else if (pathname.startsWith('/dashboard/agents/') && req.method === 'GET') {
        const agentId = pathname.replace('/dashboard/agents/', '');
        await this.handleAgent(res, tenantId, agentId, storage);
      } else if (pathname === '/dashboard/memory' && req.method === 'GET') {
        await this.handleMemory(res, tenantId, storage);
      } else if (pathname === '/dashboard/memory/search' && req.method === 'GET') {
        const query = parsed.query['q'] as string | undefined;
        await this.handleMemorySearch(res, tenantId, query, storage);
      } else if (pathname === '/dashboard/audit' && req.method === 'GET') {
        const date = parsed.query['date'] as string | undefined;
        await this.handleAudit(res, tenantId, date, storage);
      } else if (pathname === '/dashboard/usage' && req.method === 'GET') {
        await this.handleUsage(res, tenantId);
      } else if (pathname === '/dashboard/billing' && req.method === 'GET') {
        await this.handleBilling(res, tenantId, storage);
      } else if (pathname === '/dashboard/status' && req.method === 'GET') {
        await this.handleStatus(res, tenantId, storage);
      } else {
        notFound(res);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 500, { error: 'Internal server error', message });
    }
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────────

  private async handleAgents(
    res: http.ServerResponse,
    tenantId: string,
    storage: TenantStorage
  ): Promise<void> {
    const governorState = storage.readGovernorState();
    const agentKeys = storage.listMemoryKeys().filter(k => k.startsWith('agent_'));

    const agents = agentKeys.map(key => {
      const raw = storage.readMemory(key);
      try { return raw ? JSON.parse(raw) : { id: key, status: 'unknown' }; }
      catch { return { id: key, status: 'unknown' }; }
    });

    json(res, 200, {
      tenantId,
      agents,
      governorActive: !!governorState,
      retrievedAt: new Date().toISOString(),
    });
  }

  private async handleAgent(
    res: http.ServerResponse,
    tenantId: string,
    agentId: string,
    storage: TenantStorage
  ): Promise<void> {
    const raw = storage.readMemory(`agent_${agentId}`);
    if (!raw) {
      notFound(res);
      return;
    }
    try {
      json(res, 200, JSON.parse(raw));
    } catch {
      json(res, 200, { id: agentId, raw });
    }
  }

  private async handleMemory(
    res: http.ServerResponse,
    tenantId: string,
    storage: TenantStorage
  ): Promise<void> {
    const keys = storage.listMemoryKeys();
    const stats = storage.stats();

    json(res, 200, {
      tenantId,
      memoryKeys: keys,
      totalKeys: keys.length,
      storageStats: stats,
      meridianDir: storage.meridianDir,
      retrievedAt: new Date().toISOString(),
    });
  }

  private async handleMemorySearch(
    res: http.ServerResponse,
    tenantId: string,
    query: string | undefined,
    storage: TenantStorage
  ): Promise<void> {
    if (!query || query.trim().length < 2) {
      json(res, 400, { error: 'Query parameter "q" must be at least 2 characters' });
      return;
    }

    this.opts.usageTracker.trackMemorySearch(tenantId);
    const results = storage.searchMemory(query);

    json(res, 200, {
      tenantId,
      query,
      results,
      count: results.length,
      searchedAt: new Date().toISOString(),
    });
  }

  private async handleAudit(
    res: http.ServerResponse,
    tenantId: string,
    date: string | undefined,
    storage: TenantStorage
  ): Promise<void> {
    const entries = storage.readAuditLog(date);
    json(res, 200, {
      tenantId,
      date: date ?? new Date().toISOString().slice(0, 10),
      entries,
      count: entries.length,
    });
  }

  private async handleUsage(
    res: http.ServerResponse,
    tenantId: string,
  ): Promise<void> {
    const usage = this.opts.usageTracker.getCurrent(tenantId);
    const avgResponseMs = this.opts.usageTracker.getAverageResponseMs(tenantId);
    const periods = this.opts.usageTracker.listPeriods(tenantId);

    json(res, 200, {
      tenantId,
      currentPeriod: usage,
      avgAgentResponseMs: avgResponseMs,
      availablePeriods: periods,
    });
  }

  private async handleBilling(
    res: http.ServerResponse,
    tenantId: string,
    storage: TenantStorage
  ): Promise<void> {
    const usage = this.opts.usageTracker.getCurrent(tenantId);

    json(res, 200, {
      tenantId,
      currentPeriod: usage.period,
      apiCallsThisPeriod: usage.apiCallsTotal,
      messagesThisPeriod: usage.messagesProcessed,
      consolidationsThisPeriod: usage.consolidationsRun,
      retrievedAt: new Date().toISOString(),
    });
  }

  private async handleStatus(
    res: http.ServerResponse,
    tenantId: string,
    storage: TenantStorage
  ): Promise<void> {
    const usage = storage.readUsage();
    json(res, 200, {
      tenantId,
      status: 'running',
      usage,
      checkedAt: new Date().toISOString(),
    });
  }
}
