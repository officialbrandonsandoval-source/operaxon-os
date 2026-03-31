// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

import { readFile, access, constants } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  OperaxonConfig,
  GovernorConfig,
  AgentConfig,
  ChannelConfig,
  RuntimeConfig,
  MemoryConfig,
} from '@operaxon/types';

/**
 * Result of config validation, containing any issues found.
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  securityIssues: ConfigSecurityIssue[];
}

/**
 * A security issue detected in configuration values.
 */
export interface ConfigSecurityIssue {
  field: string;
  severity: 'critical' | 'warning';
  message: string;
}

/**
 * Patterns that indicate secrets accidentally embedded in config values.
 */
const SECRET_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /^sk[-_]/i, label: 'API secret key' },
  { pattern: /^pk[-_]/i, label: 'API public key (should use keychain ref)' },
  { pattern: /^ghp_/, label: 'GitHub personal access token' },
  { pattern: /^gho_/, label: 'GitHub OAuth token' },
  { pattern: /^xox[bpsa]-/, label: 'Slack token' },
  { pattern: /^AIza/, label: 'Google API key' },
  { pattern: /^AKIA/, label: 'AWS access key' },
  { pattern: /^eyJ[a-zA-Z0-9]/, label: 'JWT token' },
  { pattern: /^bot\d+:AAF/, label: 'Telegram bot token' },
  { pattern: /^-----BEGIN (RSA |EC |DSA )?PRIVATE KEY/, label: 'Private key' },
  { pattern: /^[a-f0-9]{40,}$/i, label: 'Possible hex-encoded secret' },
  { pattern: /^bearer\s+/i, label: 'Bearer token' },
  { pattern: /password/i, label: 'Password value' },
];

/**
 * Load an Operaxon configuration from a deployment directory.
 *
 * Looks for `operaxon.config.json` in the given directory. The config file
 * must be JSON (not TS) to avoid eval-based loading in production.
 *
 * Throws if the file does not exist or cannot be parsed.
 */
export async function loadConfig(deploymentDir: string): Promise<OperaxonConfig> {
  const configPath = resolve(join(deploymentDir, 'operaxon.config.json'));

  try {
    await access(configPath, constants.R_OK);
  } catch {
    throw new Error(`Config file not found or not readable: ${configPath}`);
  }

  const raw = await readFile(configPath, 'utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Config file is not valid JSON: ${configPath}`);
  }

  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('Config must be a non-null object');
  }

  const config = parsed as OperaxonConfig;
  const validation = validateConfig(config);

  if (!validation.valid) {
    const allErrors = [
      ...validation.errors,
      ...validation.securityIssues
        .filter((s) => s.severity === 'critical')
        .map((s) => `SECURITY: ${s.field} — ${s.message}`),
    ];
    throw new Error(`Invalid configuration:\n  ${allErrors.join('\n  ')}`);
  }

  return config;
}

/**
 * Validate an OperaxonConfig for completeness, correctness, and security.
 */
export function validateConfig(config: OperaxonConfig): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const securityIssues: ConfigSecurityIssue[] = [];

  // --- Governor section ---
  if (!config.governor) {
    errors.push('Missing required field: governor');
  } else {
    validateGovernor(config.governor, errors, warnings);
  }

  // --- Agents section ---
  if (!config.agents) {
    errors.push('Missing required field: agents');
  } else if (!Array.isArray(config.agents)) {
    errors.push('Field "agents" must be an array');
  } else {
    const agentIds = new Set<string>();
    for (const agent of config.agents) {
      validateAgent(agent, agentIds, errors, warnings);
    }
  }

  // --- Channels section ---
  if (!config.channels) {
    errors.push('Missing required field: channels');
  } else if (!Array.isArray(config.channels)) {
    errors.push('Field "channels" must be an array');
  } else {
    for (const channel of config.channels) {
      validateChannel(channel, errors, securityIssues);
    }
  }

  // --- Runtime section ---
  if (!config.runtime) {
    errors.push('Missing required field: runtime');
  } else {
    validateRuntime(config.runtime, errors);
  }

  // --- Deep secret scan across all string values ---
  scanForSecrets(config, '', securityIssues);

  return {
    valid: errors.length === 0 && securityIssues.filter((s) => s.severity === 'critical').length === 0,
    errors,
    warnings,
    securityIssues,
  };
}

/**
 * Return sensible default configuration values.
 */
export function getDefaults(): OperaxonConfig {
  const memory: MemoryConfig = {
    storagePath: './data/memory',
    encryptionKeyRef: 'operaxon-memory-key',
    maxMemoryLines: 200,
    consolidationInterval: 24,
    minSessionsBeforeConsolidation: 5,
  };

  const governor: GovernorConfig = {
    name: 'governor',
    model: 'claude-sonnet-4-20250514',
    memory,
    principals: [],
  };

  const runtime: RuntimeConfig = {
    port: 3100,
    host: '127.0.0.1',
    logLevel: 'info',
    rateLimiting: {
      windowMs: 60_000,
      maxRequests: 100,
    },
    cors: {
      allowedOrigins: [],
      allowedMethods: ['GET', 'POST'],
    },
  };

  return {
    governor,
    agents: [],
    channels: [],
    runtime,
  };
}

// ─── Validation helpers ─────────────────────────────────────────────────────

function validateGovernor(gov: GovernorConfig, errors: string[], warnings: string[]): void {
  if (!gov.name || gov.name.trim().length === 0) {
    errors.push('governor.name must be a non-empty string');
  }
  if (!gov.model || gov.model.trim().length === 0) {
    errors.push('governor.model must be a non-empty string');
  }
  if (!gov.memory) {
    errors.push('governor.memory is required');
  } else {
    if (!gov.memory.storagePath) {
      errors.push('governor.memory.storagePath is required');
    }
    if (!gov.memory.encryptionKeyRef) {
      errors.push('governor.memory.encryptionKeyRef is required');
    }
    if (gov.memory.maxMemoryLines <= 0) {
      errors.push('governor.memory.maxMemoryLines must be positive');
    }
    if (gov.memory.consolidationInterval <= 0) {
      errors.push('governor.memory.consolidationInterval must be positive');
    }
  }
  if (!gov.principals || gov.principals.length === 0) {
    warnings.push('No principals defined — governor will have no one to report to');
  } else {
    const hasSovereign = gov.principals.some((p) => p.authority === 'sovereign');
    if (!hasSovereign) {
      errors.push('At least one principal must have sovereign authority');
    }
  }
}

function validateAgent(
  agent: AgentConfig,
  seenIds: Set<string>,
  errors: string[],
  warnings: string[],
): void {
  if (!agent.id || agent.id.trim().length === 0) {
    errors.push('Agent id must be a non-empty string');
    return;
  }
  if (seenIds.has(agent.id)) {
    errors.push(`Duplicate agent id: ${agent.id}`);
  }
  seenIds.add(agent.id);

  if (!agent.name) {
    errors.push(`Agent ${agent.id}: name is required`);
  }
  if (!agent.role) {
    errors.push(`Agent ${agent.id}: role is required`);
  }
  if (!agent.model) {
    errors.push(`Agent ${agent.id}: model is required`);
  }
  if (!agent.domains || agent.domains.length === 0) {
    warnings.push(`Agent ${agent.id}: no domains specified — agent will not receive routed messages`);
  }
  if (!agent.containment) {
    errors.push(`Agent ${agent.id}: containment policy is required`);
  } else {
    if (agent.containment.clearanceLevel < 0 || agent.containment.clearanceLevel > 10) {
      errors.push(`Agent ${agent.id}: clearanceLevel must be between 0 and 10`);
    }
    if (agent.containment.maxConcurrentActions <= 0) {
      errors.push(`Agent ${agent.id}: maxConcurrentActions must be positive`);
    }
  }
}

function validateChannel(
  channel: ChannelConfig,
  errors: string[],
  securityIssues: ConfigSecurityIssue[],
): void {
  if (!channel.id) {
    errors.push('Channel id is required');
  }
  if (!channel.type) {
    errors.push(`Channel ${channel.id ?? '(unknown)'}: type is required`);
  }

  // Credentials must be a keychain reference, not an actual secret
  if (channel.credentials) {
    checkForSecret(
      `channels[${channel.id ?? '?'}].credentials`,
      channel.credentials,
      securityIssues,
    );
  }
}

function validateRuntime(runtime: RuntimeConfig, errors: string[]): void {
  if (runtime.port <= 0 || runtime.port > 65535) {
    errors.push('runtime.port must be between 1 and 65535');
  }
  if (!runtime.host) {
    errors.push('runtime.host is required');
  }
  if (runtime.host === '0.0.0.0') {
    errors.push('runtime.host "0.0.0.0" binds to all interfaces — use "127.0.0.1" for local-only');
  }
  if (!runtime.rateLimiting) {
    errors.push('runtime.rateLimiting is required');
  } else {
    if (runtime.rateLimiting.windowMs <= 0) {
      errors.push('runtime.rateLimiting.windowMs must be positive');
    }
    if (runtime.rateLimiting.maxRequests <= 0) {
      errors.push('runtime.rateLimiting.maxRequests must be positive');
    }
  }
}

function checkForSecret(
  field: string,
  value: string,
  issues: ConfigSecurityIssue[],
): void {
  for (const { pattern, label } of SECRET_PATTERNS) {
    if (pattern.test(value)) {
      issues.push({
        field,
        severity: 'critical',
        message: `Possible secret detected (${label}). Use a keychain reference instead.`,
      });
      return; // one match is enough
    }
  }
}

/**
 * Recursively scan all string values in an object for secret patterns.
 */
function scanForSecrets(
  obj: unknown,
  path: string,
  issues: ConfigSecurityIssue[],
): void {
  if (typeof obj === 'string') {
    checkForSecret(path, obj, issues);
    return;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      scanForSecrets(obj[i], `${path}[${i}]`, issues);
    }
    return;
  }
  if (obj !== null && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      scanForSecrets(value, path ? `${path}.${key}` : key, issues);
    }
  }
}
