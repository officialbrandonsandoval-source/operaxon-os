// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * health-check.ts — Verify tenant instance is running and responding
 */

import * as http from 'node:http';
import * as https from 'node:https';
import { TenantManager } from './tenant-manager.js';

// ─── Health result ────────────────────────────────────────────────────────────

export interface HealthResult {
  tenantId: string;
  healthy: boolean;
  checkedAt: string;
  responseMs?: number;
  statusCode?: number;
  body?: Record<string, unknown>;
  error?: string;
}

// ─── HealthChecker ────────────────────────────────────────────────────────────

export class HealthChecker {
  private tenantManager: TenantManager;
  private timeoutMs: number;

  constructor(tenantManager: TenantManager, timeoutMs = 5000) {
    this.tenantManager = tenantManager;
    this.timeoutMs = timeoutMs;
  }

  // Check a single tenant
  async check(tenantId: string): Promise<HealthResult> {
    const tenant = this.tenantManager.get(tenantId);
    if (!tenant) {
      return {
        tenantId,
        healthy: false,
        checkedAt: new Date().toISOString(),
        error: 'Tenant not found',
      };
    }

    const baseUrl = tenant.instanceUrl ?? `http://localhost:${tenant.port}`;
    const healthUrl = `${baseUrl}/health`;

    const result = await this.httpGet(healthUrl);

    // Update tenant record
    this.tenantManager.recordHealthCheck(tenantId, result.healthy);

    return { tenantId, ...result };
  }

  // Check all running tenants
  async checkAll(): Promise<HealthResult[]> {
    const running = this.tenantManager.list({ status: 'running' });
    const degraded = this.tenantManager.list({ status: 'degraded' });
    const toCheck = [...running, ...degraded];

    return Promise.all(toCheck.map(t => this.check(t.id)));
  }

  // Wait until a tenant is healthy (used post-deploy)
  async waitUntilHealthy(
    tenantId: string,
    maxAttempts = 20,
    intervalMs = 5000
  ): Promise<HealthResult> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[HealthChecker] Attempt ${attempt}/${maxAttempts} for ${tenantId}...`);

      const result = await this.check(tenantId);
      if (result.healthy) {
        console.log(`[HealthChecker] ${tenantId} is healthy after ${attempt} attempts`);
        return result;
      }

      if (attempt < maxAttempts) {
        await this.sleep(intervalMs);
      }
    }

    return {
      tenantId,
      healthy: false,
      checkedAt: new Date().toISOString(),
      error: `Instance did not become healthy after ${maxAttempts} attempts`,
    };
  }

  // ─── HTTP probe ───────────────────────────────────────────────────────────────

  private async httpGet(url: string): Promise<Omit<HealthResult, 'tenantId'>> {
    const start = Date.now();

    return new Promise(resolve => {
      const isHttps = url.startsWith('https://');
      const client = isHttps ? https : http;

      const req = client.get(url, { timeout: this.timeoutMs }, res => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          const responseMs = Date.now() - start;
          let parsed: Record<string, unknown> | undefined;

          try { parsed = JSON.parse(body); } catch { /* not JSON */ }

          const healthy = res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300;

          resolve({
            healthy,
            checkedAt: new Date().toISOString(),
            responseMs,
            statusCode: res.statusCode,
            body: parsed,
          });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          healthy: false,
          checkedAt: new Date().toISOString(),
          responseMs: Date.now() - start,
          error: `Request timed out after ${this.timeoutMs}ms`,
        });
      });

      req.on('error', err => {
        resolve({
          healthy: false,
          checkedAt: new Date().toISOString(),
          responseMs: Date.now() - start,
          error: err.message,
        });
      });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
