// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * deployer.ts — Docker provisioning + environment setup
 * Spins up a new tenant instance from a provisioned config.
 * Supports: fly.io (primary), docker-compose (local/self-hosted)
 */

import { execSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProvisionedConfig } from '@operaxon/onboarding';
import { TenantManager } from './tenant-manager.js';

// ─── Deploy result ────────────────────────────────────────────────────────────

export type DeployStatus = 'success' | 'failed' | 'rolled_back';

export interface DeployResult {
  tenantId: string;
  status: DeployStatus;
  instanceUrl: string;
  port: number;
  deployedAt: string;
  durationMs: number;
  logs: string[];
  error?: string;
}

export interface DeployerOptions {
  dockerRegistry?: string;       // e.g. "registry.fly.io"
  templateDir: string;           // path to Dockerfile + docker-compose templates
  deployTimeoutMs?: number;      // default 5 minutes
}

// ─── Deployer ─────────────────────────────────────────────────────────────────

export class Deployer {
  private opts: DeployerOptions;
  private tenantManager: TenantManager;

  constructor(opts: DeployerOptions, tenantManager: TenantManager) {
    this.opts = {
      deployTimeoutMs: 5 * 60 * 1000,
      ...opts,
    };
    this.tenantManager = tenantManager;
  }

  // ─── Main deploy entry point ──────────────────────────────────────────────────

  async deploy(config: ProvisionedConfig): Promise<DeployResult> {
    const startTime = Date.now();
    const logs: string[] = [];
    const log = (msg: string) => {
      logs.push(`[${new Date().toISOString()}] ${msg}`);
      console.log(`[Deployer:${config.tenantId}] ${msg}`);
    };

    try {
      log(`Starting deployment for tenant ${config.tenantId}`);
      log(`Target: ${config.deploymentTarget}, tier: ${config.tier}`);

      this.tenantManager.updateStatus(config.tenantId, 'deploying');

      let instanceUrl: string;

      if (config.deploymentTarget === 'fly.io') {
        instanceUrl = await this.deployToFly(config, log);
      } else {
        instanceUrl = await this.deployDockerCompose(config, log);
      }

      this.tenantManager.setInstanceUrl(config.tenantId, instanceUrl);
      this.tenantManager.updateStatus(config.tenantId, 'running');

      log(`Deployment complete. Instance URL: ${instanceUrl}`);

      return {
        tenantId: config.tenantId,
        status: 'success',
        instanceUrl,
        port: config.instancePort,
        deployedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        logs,
      };

    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log(`Deployment failed: ${error}`);

      // Attempt rollback
      try {
        await this.rollback(config.tenantId, log);
        this.tenantManager.updateStatus(config.tenantId, 'failed');
        return {
          tenantId: config.tenantId,
          status: 'rolled_back',
          instanceUrl: '',
          port: config.instancePort,
          deployedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
          logs,
          error,
        };
      } catch (rollbackErr) {
        log(`Rollback also failed: ${rollbackErr}`);
        this.tenantManager.updateStatus(config.tenantId, 'failed');
        return {
          tenantId: config.tenantId,
          status: 'failed',
          instanceUrl: '',
          port: config.instancePort,
          deployedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
          logs,
          error,
        };
      }
    }
  }

  // ─── Fly.io deployment ────────────────────────────────────────────────────────

  private async deployToFly(
    config: ProvisionedConfig,
    log: (msg: string) => void
  ): Promise<string> {
    log(`Deploying to Fly.io as app: ${config.instanceName}`);

    // Read deploy manifest
    const manifest = JSON.parse(
      fs.readFileSync(config.deployManifestPath, 'utf-8')
    );

    // Generate fly.toml for this tenant
    const flyToml = this.generateFlyToml(config, manifest);
    const flyTomlPath = path.join(config.outputDir, 'fly.toml');
    fs.writeFileSync(flyTomlPath, flyToml, 'utf-8');
    log(`Generated fly.toml at ${flyTomlPath}`);

    // Check if flyctl is available
    try {
      execSync('flyctl version', { stdio: 'pipe' });
    } catch {
      log('flyctl not found — generating fly.toml for manual deployment');
      log(`Manual command: cd ${config.outputDir} && flyctl deploy`);
      // Return a placeholder URL; real URL set after manual deploy
      return `https://${config.instanceName}.fly.dev`;
    }

    // Launch app (creates it if not exists)
    log('Launching Fly.io app...');
    try {
      execSync(
        `flyctl apps create ${config.instanceName} --json 2>&1 || true`,
        { cwd: config.outputDir, stdio: 'pipe' }
      );
    } catch {
      log('App may already exist, continuing...');
    }

    // Set secrets from env file
    log('Setting Fly.io secrets...');
    const envContents = fs.readFileSync(config.envFilePath, 'utf-8');
    const secrets = envContents
      .split('\n')
      .filter(line => line.includes('=') && !line.startsWith('#') && line.trim())
      .map(line => {
        const [key, ...rest] = line.split('=');
        const value = rest.join('=').replace(/^"|"$/g, '');
        return `${key.trim()}=${value}`;
      })
      .join(' ');

    if (secrets) {
      execSync(`flyctl secrets set ${secrets} --app ${config.instanceName} 2>&1`, {
        cwd: config.outputDir,
        stdio: 'pipe',
      });
    }

    // Deploy
    log('Deploying...');
    execSync(`flyctl deploy --app ${config.instanceName} --remote-only 2>&1`, {
      cwd: config.outputDir,
      stdio: 'inherit',
      timeout: this.opts.deployTimeoutMs,
    });

    return `https://${config.instanceName}.fly.dev`;
  }

  // ─── Docker Compose (local/self-hosted) ──────────────────────────────────────

  private async deployDockerCompose(
    config: ProvisionedConfig,
    log: (msg: string) => void
  ): Promise<string> {
    log(`Deploying via Docker Compose on port ${config.instancePort}`);

    // Generate docker-compose.yml for this tenant
    const composeContent = this.generateDockerCompose(config);
    const composePath = path.join(config.outputDir, 'docker-compose.yml');
    fs.writeFileSync(composePath, composeContent, 'utf-8');
    log(`Generated docker-compose.yml at ${composePath}`);

    // Check if docker is available
    try {
      execSync('docker --version', { stdio: 'pipe' });
    } catch {
      log('Docker not found — config files ready for manual deployment');
      log(`Manual command: cd ${config.outputDir} && docker-compose up -d`);
      return `http://localhost:${config.instancePort}`;
    }

    // Pull latest image
    log('Pulling latest Operaxon OS image...');
    try {
      execSync('docker pull operaxon/os:latest 2>&1', { stdio: 'pipe' });
    } catch {
      log('Could not pull image — using local build or existing image');
    }

    // Start container
    log('Starting container...');
    execSync(`docker-compose up -d 2>&1`, {
      cwd: config.outputDir,
      stdio: 'inherit',
      timeout: this.opts.deployTimeoutMs,
    });

    return `http://localhost:${config.instancePort}`;
  }

  // ─── Rollback ─────────────────────────────────────────────────────────────────

  private async rollback(tenantId: string, log: (msg: string) => void): Promise<void> {
    const tenant = this.tenantManager.get(tenantId);
    if (!tenant) {
      log(`Cannot rollback — tenant ${tenantId} not found`);
      return;
    }

    log(`Rolling back tenant ${tenantId}...`);

    if (tenant.deploymentTarget === 'fly.io') {
      try {
        execSync(`flyctl releases rollback --app ${tenant.instanceName} 2>&1`, { stdio: 'pipe' });
        log('Fly.io rollback complete');
      } catch (err) {
        log(`Fly.io rollback failed: ${err}`);
        throw err;
      }
    } else {
      try {
        execSync(`docker-compose down 2>&1`, {
          cwd: tenant.configDir,
          stdio: 'pipe',
        });
        log('Docker Compose rollback complete (container stopped)');
      } catch (err) {
        log(`Docker rollback failed: ${err}`);
        throw err;
      }
    }
  }

  // ─── Template generators ──────────────────────────────────────────────────────

  private generateFlyToml(config: ProvisionedConfig, manifest: Record<string, unknown>): string {
    const flyConf = manifest.flyio as Record<string, string> | undefined;
    const region = flyConf?.region ?? 'iad';
    const vm = flyConf?.vm ?? 'shared-cpu-1x';

    return `# Operaxon OS — Tenant fly.toml
# Generated: ${new Date().toISOString()}
# Tenant: ${config.tenantId}

app = "${config.instanceName}"
primary_region = "${region}"

[build]
  image = "operaxon/os:latest"

[env]
  PORT = "${config.instancePort}"
  TENANT_ID = "${config.tenantId}"

[http_service]
  internal_port = ${config.instancePort}
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

[[vm]]
  size = "${vm}"
  memory = "512mb"

[checks]
  [checks.alive]
    grace_period = "10s"
    interval = "30s"
    method = "get"
    path = "/health"
    port = ${config.instancePort}
    timeout = "5s"
    type = "http"
`;
  }

  private generateDockerCompose(config: ProvisionedConfig): string {
    return `# Operaxon OS — Tenant docker-compose.yml
# Generated: ${new Date().toISOString()}
# Tenant: ${config.tenantId}

version: '3.8'

services:
  operaxon-${config.tenantId.replace('tenant_', '')}:
    image: operaxon/os:latest
    container_name: ${config.instanceName}
    restart: unless-stopped
    ports:
      - "${config.instancePort}:${config.instancePort}"
    env_file:
      - .env
    volumes:
      - ./data:/app/data
      - ./meridian:/app/meridian
      - ./logs:/app/logs
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:${config.instancePort}/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    labels:
      operaxon.tenant: "${config.tenantId}"
      operaxon.tier: "${config.tier}"
`;
  }
}
