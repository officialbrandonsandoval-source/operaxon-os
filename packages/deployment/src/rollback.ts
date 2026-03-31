// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * rollback.ts — Rollback a failed deployment
 * Supports: Fly.io (release rollback), Docker (stop + restore)
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TenantManager } from './tenant-manager.js';

// ─── Rollback result ──────────────────────────────────────────────────────────

export interface RollbackResult {
  tenantId: string;
  success: boolean;
  strategy: 'fly-release' | 'docker-stop' | 'config-restore' | 'no-op';
  message: string;
  rolledBackAt: string;
}

// ─── RollbackManager ──────────────────────────────────────────────────────────

export class RollbackManager {
  private tenantManager: TenantManager;
  private snapshotDir: string;

  constructor(tenantManager: TenantManager, snapshotDir: string) {
    this.tenantManager = tenantManager;
    this.snapshotDir = snapshotDir;
  }

  // ─── Take a pre-deploy snapshot ───────────────────────────────────────────────

  snapshot(tenantId: string, configDir: string): void {
    const snapshotPath = path.join(this.snapshotDir, tenantId, 'pre-deploy');
    fs.mkdirSync(snapshotPath, { recursive: true });

    // Copy current config files to snapshot
    if (fs.existsSync(configDir)) {
      const files = fs.readdirSync(configDir).filter(f => !f.includes('node_modules'));
      for (const file of files) {
        const src = path.join(configDir, file);
        const dest = path.join(snapshotPath, file);
        if (fs.statSync(src).isFile()) {
          fs.copyFileSync(src, dest);
        }
      }
    }

    // Record snapshot metadata
    fs.writeFileSync(
      path.join(snapshotPath, 'snapshot.json'),
      JSON.stringify({
        tenantId,
        configDir,
        snapshotAt: new Date().toISOString(),
      }),
      'utf-8'
    );

    console.log(`[Rollback] Snapshot taken for ${tenantId}`);
  }

  // ─── Execute rollback ─────────────────────────────────────────────────────────

  async rollback(tenantId: string): Promise<RollbackResult> {
    const tenant = this.tenantManager.get(tenantId);
    if (!tenant) {
      return {
        tenantId,
        success: false,
        strategy: 'no-op',
        message: `Tenant not found: ${tenantId}`,
        rolledBackAt: new Date().toISOString(),
      };
    }

    console.log(`[Rollback] Starting rollback for ${tenantId} (${tenant.deploymentTarget})`);

    try {
      if (tenant.deploymentTarget === 'fly.io') {
        return await this.rollbackFly(tenantId, tenant.instanceName);
      } else {
        return await this.rollbackDocker(tenantId, tenant.configDir);
      }
    } catch (err) {
      // Last resort: restore from snapshot
      return this.restoreFromSnapshot(tenantId);
    }
  }

  // ─── Fly.io rollback ──────────────────────────────────────────────────────────

  private async rollbackFly(tenantId: string, appName: string): Promise<RollbackResult> {
    try {
      execSync(`flyctl releases rollback --app ${appName} 2>&1`, {
        stdio: 'pipe',
        timeout: 120000,
      });

      this.tenantManager.updateStatus(tenantId, 'running');

      return {
        tenantId,
        success: true,
        strategy: 'fly-release',
        message: `Fly.io release rolled back for app ${appName}`,
        rolledBackAt: new Date().toISOString(),
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.tenantManager.updateStatus(tenantId, 'failed');
      return {
        tenantId,
        success: false,
        strategy: 'fly-release',
        message: `Fly.io rollback failed: ${error}`,
        rolledBackAt: new Date().toISOString(),
      };
    }
  }

  // ─── Docker rollback ──────────────────────────────────────────────────────────

  private async rollbackDocker(tenantId: string, configDir: string): Promise<RollbackResult> {
    try {
      // Stop current container
      execSync(`docker-compose down 2>&1`, {
        cwd: configDir,
        stdio: 'pipe',
        timeout: 60000,
      });

      this.tenantManager.updateStatus(tenantId, 'stopped');

      return {
        tenantId,
        success: true,
        strategy: 'docker-stop',
        message: `Container stopped. Instance at ${configDir} is down.`,
        rolledBackAt: new Date().toISOString(),
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        tenantId,
        success: false,
        strategy: 'docker-stop',
        message: `Docker rollback failed: ${error}`,
        rolledBackAt: new Date().toISOString(),
      };
    }
  }

  // ─── Config snapshot restore ──────────────────────────────────────────────────

  private restoreFromSnapshot(tenantId: string): RollbackResult {
    const snapshotPath = path.join(this.snapshotDir, tenantId, 'pre-deploy');

    if (!fs.existsSync(snapshotPath)) {
      return {
        tenantId,
        success: false,
        strategy: 'config-restore',
        message: `No snapshot found for tenant ${tenantId}`,
        rolledBackAt: new Date().toISOString(),
      };
    }

    const tenant = this.tenantManager.get(tenantId);
    if (!tenant) {
      return {
        tenantId,
        success: false,
        strategy: 'config-restore',
        message: 'Tenant not found for snapshot restore',
        rolledBackAt: new Date().toISOString(),
      };
    }

    // Restore config files from snapshot
    const files = fs.readdirSync(snapshotPath).filter(f => f !== 'snapshot.json');
    for (const file of files) {
      fs.copyFileSync(
        path.join(snapshotPath, file),
        path.join(tenant.configDir, file)
      );
    }

    this.tenantManager.updateStatus(tenantId, 'stopped');

    return {
      tenantId,
      success: true,
      strategy: 'config-restore',
      message: `Config restored from snapshot. Manual redeploy required.`,
      rolledBackAt: new Date().toISOString(),
    };
  }
}
