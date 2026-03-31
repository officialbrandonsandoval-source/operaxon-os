// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * provisioner.ts — Auto-generates customer config from questionnaire
 * Reads the questionnaire response and emits:
 *   - .env file for the tenant instance
 *   - operaxon.config.json (OperaxonConfig)
 *   - agent definition files
 *   - deployment manifest
 */

import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { QuestionnaireResponse, validateQuestionnaire } from './questionnaire.js';
import { CustomerTier, TIER_PRICING } from './customer.js';

// ─── Output types ─────────────────────────────────────────────────────────────

export interface ProvisionedConfig {
  tenantId: string;
  customerId: string;
  tier: CustomerTier;

  // File paths written
  outputDir: string;
  envFilePath: string;
  configFilePath: string;
  agentConfigPaths: string[];
  deployManifestPath: string;

  // Runtime values
  apiKey: string;
  adminPassword: string;
  instancePort: number;

  // Deployment target
  deploymentTarget: string;
  instanceName: string;         // e.g. "operaxon-tenant-abc123"
}

export interface ProvisionerOptions {
  outputBaseDir: string;        // e.g. "./deployments"
  basePort: number;             // starting port for tenant instances (default 4000)
  existingPorts?: Set<number>;  // ports already in use
}

// ─── Provisioner ─────────────────────────────────────────────────────────────

export class Provisioner {
  private opts: ProvisionerOptions;

  constructor(opts: ProvisionerOptions) {
    this.opts = {
      basePort: 4000,
      existingPorts: new Set(),
      ...opts,
    };
  }

  provision(
    questionnaire: QuestionnaireResponse,
    tenantId: string,
  ): ProvisionedConfig {
    // Validate first
    const validation = validateQuestionnaire(questionnaire);
    if (!validation.valid) {
      throw new Error(`Invalid questionnaire: ${validation.errors.join('; ')}`);
    }

    const port = this.allocatePort();
    const apiKey = `ox_live_${randomBytes(24).toString('hex')}`;
    const adminPassword = randomBytes(16).toString('hex');
    const instanceName = `operaxon-${tenantId.replace('tenant_', '')}`;

    const outputDir = path.join(this.opts.outputBaseDir, tenantId);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(path.join(outputDir, 'agents'), { recursive: true });

    // 1. Write .env
    const envFilePath = path.join(outputDir, '.env');
    this.writeEnvFile(envFilePath, {
      tenantId,
      customerId: questionnaire.customerId,
      port,
      apiKey,
      adminPassword,
      tier: questionnaire.selectedTier,
      businessName: questionnaire.businessName,
      deploymentTarget: questionnaire.deploymentTarget,
      dataRegion: questionnaire.dataRegion,
      memoryPath: questionnaire.memoryStoragePath || `meridian/${tenantId}`,
    });

    // 2. Write operaxon.config.json
    const configFilePath = path.join(outputDir, 'operaxon.config.json');
    const config = this.buildOperaxonConfig(questionnaire, tenantId);
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf-8');

    // 3. Write individual agent config files
    const agentConfigPaths: string[] = [];
    for (const agent of questionnaire.agents) {
      const slug = agent.name.toLowerCase().replace(/\s+/g, '-');
      const agentPath = path.join(outputDir, 'agents', `${slug}.json`);
      fs.writeFileSync(agentPath, JSON.stringify(agent, null, 2), 'utf-8');
      agentConfigPaths.push(agentPath);
    }

    // 4. Write deployment manifest
    const deployManifestPath = path.join(outputDir, 'deploy-manifest.json');
    const manifest = this.buildDeployManifest({
      tenantId,
      instanceName,
      port,
      tier: questionnaire.selectedTier,
      deploymentTarget: questionnaire.deploymentTarget,
      dataRegion: questionnaire.dataRegion,
    });
    fs.writeFileSync(deployManifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    return {
      tenantId,
      customerId: questionnaire.customerId,
      tier: questionnaire.selectedTier,
      outputDir,
      envFilePath,
      configFilePath,
      agentConfigPaths,
      deployManifestPath,
      apiKey,
      adminPassword,
      instancePort: port,
      deploymentTarget: questionnaire.deploymentTarget,
      instanceName,
    };
  }

  private allocatePort(): number {
    let port = this.opts.basePort;
    while (this.opts.existingPorts!.has(port)) {
      port++;
    }
    this.opts.existingPorts!.add(port);
    return port;
  }

  private writeEnvFile(filePath: string, values: Record<string, string | number>): void {
    const lines = [
      '# Operaxon OS — Tenant Environment',
      `# Generated: ${new Date().toISOString()}`,
      '# DO NOT COMMIT — contains secrets',
      '',
      ...Object.entries(values).map(([k, v]) => {
        const key = k.replace(/([A-Z])/g, '_$1').toUpperCase();
        return `${key}="${v}"`;
      }),
      '',
      '# Credentials (fill in before deployment)',
      '# TELEGRAM_BOT_TOKEN=""',
      '# DISCORD_BOT_TOKEN=""',
      '# SLACK_BOT_TOKEN=""',
      '# ANTHROPIC_API_KEY=""',
      '# STRIPE_SECRET_KEY=""',
    ];
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  }

  private buildOperaxonConfig(q: QuestionnaireResponse, tenantId: string): Record<string, unknown> {
    const tierPricing = TIER_PRICING[q.selectedTier];

    return {
      version: '1.0.0',
      tenantId,
      governor: {
        name: q.agents.find(a => a.type === 'governing')?.name ?? 'Nexus',
        model: `anthropic/claude-${q.agents.find(a => a.type === 'governing')?.model ?? 'sonnet'}-4-6`,
        memory: {
          storagePath: q.memoryStoragePath || `meridian/${tenantId}`,
          encryptionKeyRef: `keychain:operaxon-${tenantId}`,
          maxMemoryLines: 200,
          consolidationInterval: 24,
          minSessionsBeforeConsolidation: 5,
        },
        principals: [
          {
            id: 'principal_001',
            name: q.principalName,
            contact: q.principalContact,
            authority: 'sovereign',
          },
        ],
      },
      agents: q.agents.map(a => ({
        id: `agent_${a.name.toLowerCase().replace(/\s+/g, '_')}`,
        name: a.name,
        role: a.role,
        model: `anthropic/claude-${a.model}-4-6`,
        domains: a.domains,
        tools: a.tools,
        memory: a.autonomyLevel === 'autonomous' ? 'isolated' : 'shared',
        containment: {
          allowedTools: a.tools,
          deniedTools: [],
          maxConcurrentActions: a.autonomyLevel === 'supervised' ? 1 : 3,
          requiresApproval: a.autonomyLevel === 'supervised'
            ? ['send_message', 'publish', 'deploy']
            : [],
          clearanceLevel: a.type === 'governing' ? 9 : 5,
        },
      })),
      channels: q.channels
        .filter(c => c.enabled)
        .map(c => ({
          id: `channel_${c.type}`,
          type: c.type,
          enabled: true,
          credentials: `keychain:operaxon-${tenantId}-${c.type}`,
          options: {},
        })),
      runtime: {
        port: 4000,
        host: '0.0.0.0',
        logLevel: 'info',
        rateLimiting: {
          windowMs: 60000,
          maxRequests: tierPricing.tier === 'enterprise' ? 1000 : 100,
        },
        cors: {
          allowedOrigins: ['*'],
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
        },
      },
    };
  }

  private buildDeployManifest(opts: {
    tenantId: string;
    instanceName: string;
    port: number;
    tier: CustomerTier;
    deploymentTarget: string;
    dataRegion: string;
  }): Record<string, unknown> {
    return {
      version: '1.0.0',
      tenantId: opts.tenantId,
      instanceName: opts.instanceName,
      port: opts.port,
      tier: opts.tier,
      deploymentTarget: opts.deploymentTarget,
      dataRegion: opts.dataRegion,
      generatedAt: new Date().toISOString(),
      docker: {
        image: 'operaxon/os',
        tag: 'latest',
        envFile: '.env',
        volumeMounts: [
          { host: `./data/${opts.tenantId}`, container: '/app/data' },
          { host: `./meridian/${opts.tenantId}`, container: '/app/meridian' },
        ],
        healthCheck: {
          path: '/health',
          port: opts.port,
          intervalSeconds: 30,
          timeoutSeconds: 5,
          retries: 3,
        },
      },
      flyio: opts.deploymentTarget === 'fly.io' ? {
        app: opts.instanceName,
        region: opts.dataRegion === 'eu' ? 'ams' : opts.dataRegion === 'asia' ? 'nrt' : 'iad',
        vm: opts.tier === 'enterprise' ? 'performance-4x' : opts.tier === 'business' ? 'performance-2x' : 'shared-cpu-1x',
      } : undefined,
    };
  }
}
