// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { OperaxonConfig, MeridianState } from '@operaxon/types';
import {
  colorize,
  dim,
  printBanner,
  printTable,
  exitWithError,
  formatDuration,
  hasFlag,
  parseFlag,
} from '../helpers.js';

// ─── Status command ──────────────────────────────────────────────────────────

export async function runStatus(args: string[]): Promise<void> {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    process.stdout.write(`
  ${colorize('operaxon status', 'white', true)}

  Display the current status of the Operaxon civilization.

  ${colorize('OPTIONS', 'white', true)}
    ${colorize('--config <path>', 'cyan')}   Path to operaxon.config.json (default: ./operaxon.config.json)

`);
    return;
  }

  printBanner();

  // Load config
  const configPath = parseFlag(args, '--config') ?? join(process.cwd(), 'operaxon.config.json');

  let configRaw: string;
  try {
    configRaw = await readFile(configPath, 'utf8');
  } catch {
    exitWithError(
      `Could not read config file: ${configPath}\n\n` +
      `  Run ${colorize('operaxon init', 'cyan')} to create one.`,
    );
  }

  let config: OperaxonConfig;
  try {
    config = JSON.parse(configRaw) as OperaxonConfig;
  } catch {
    exitWithError(`Config file is not valid JSON: ${configPath}`);
  }

  const deploymentName = config.governor.name;
  const baseDir = join(homedir(), '.operaxon', deploymentName);

  // ─── Civilization header ─────────────────────────────────────────────────
  process.stdout.write(`  ${colorize('CIVILIZATION', 'white', true)}\n`);
  process.stdout.write(`  ${colorize('Name:', 'cyan')}    ${deploymentName}\n`);
  process.stdout.write(`  ${colorize('Model:', 'cyan')}   ${config.governor.model}\n`);
  process.stdout.write(`  ${colorize('Port:', 'cyan')}    ${config.runtime.port}\n`);

  // Check if runtime is responding
  let runtimeStatus = colorize('offline', 'red');
  let uptimeStr = dim('n/a');
  try {
    const response = await fetch(`http://${config.runtime.host}:${config.runtime.port}/health`);
    if (response.ok) {
      const health = (await response.json()) as { status: string; uptime: number };
      runtimeStatus = colorize('online', 'green');
      uptimeStr = formatDuration(health.uptime);
    }
  } catch {
    // Runtime not reachable
  }

  process.stdout.write(`  ${colorize('Status:', 'cyan')}  ${runtimeStatus}\n`);
  process.stdout.write(`  ${colorize('Uptime:', 'cyan')}  ${uptimeStr}\n`);
  process.stdout.write('\n');

  // ─── Agents ──────────────────────────────────────────────────────────────
  process.stdout.write(`  ${colorize('AGENTS', 'white', true)}\n`);

  if (config.agents.length === 0) {
    process.stdout.write(`  ${dim('No agents configured.')}\n`);
    process.stdout.write(`  ${dim('Run')} ${colorize('operaxon agent add', 'cyan')} ${dim('to add one.')}\n`);
  } else {
    printTable(
      [
        { header: 'Name', width: 20 },
        { header: 'Role', width: 24 },
        { header: 'Model', width: 28 },
        { header: 'Memory', width: 10 },
      ],
      config.agents.map((a) => [a.name, a.role, a.model, a.memory]),
    );
  }
  process.stdout.write('\n');

  // ─── Channels ────────────────────────────────────────────────────────────
  process.stdout.write(`  ${colorize('CHANNELS', 'white', true)}\n`);

  if (config.channels.length === 0) {
    process.stdout.write(`  ${dim('No channels configured.')}\n`);
  } else {
    printTable(
      [
        { header: 'Type', width: 12 },
        { header: 'ID', width: 28 },
        { header: 'Enabled', width: 10 },
      ],
      config.channels.map((c) => [
        c.type,
        c.id,
        c.enabled ? colorize('yes', 'green') : colorize('no', 'red'),
      ]),
    );
  }
  process.stdout.write('\n');

  // ─── Memory stats ────────────────────────────────────────────────────────
  process.stdout.write(`  ${colorize('MEMORY', 'white', true)}\n`);

  const statePath = join(baseDir, 'data', 'memory', 'state.json');
  let meridianState: MeridianState | null = null;
  try {
    const stateRaw = await readFile(statePath, 'utf8');
    meridianState = JSON.parse(stateRaw) as MeridianState;
  } catch {
    // State file not found — that's fine
  }

  if (meridianState) {
    const lastConsolidation = meridianState.lastConsolidation
      ? new Date(meridianState.lastConsolidation).toLocaleString()
      : dim('never');
    process.stdout.write(`  ${colorize('Last consolidation:', 'cyan')}    ${lastConsolidation}\n`);
    process.stdout.write(`  ${colorize('Sessions since last:', 'cyan')}    ${meridianState.sessionsSinceLastConsolidation}\n`);
    process.stdout.write(`  ${colorize('Dream lock:', 'cyan')}             ${meridianState.isLocked ? colorize('locked', 'yellow') : colorize('unlocked', 'green')}\n`);
  } else {
    process.stdout.write(`  ${dim('No memory state found. Run')} ${colorize('operaxon init', 'cyan')} ${dim('first.')}\n`);
  }

  // Count memory files
  const memoriesDir = join(baseDir, 'data', 'memory', 'memories');
  try {
    const files = await readdir(memoriesDir);
    const memFiles = files.filter((f) => f.endsWith('.mem'));
    process.stdout.write(`  ${colorize('Memory files:', 'cyan')}            ${memFiles.length}\n`);
  } catch {
    process.stdout.write(`  ${colorize('Memory files:', 'cyan')}            ${dim('0')}\n`);
  }

  // Count sessions
  const sessionsDir = join(baseDir, 'data', 'sessions');
  try {
    const sessions = await readdir(sessionsDir);
    process.stdout.write(`  ${colorize('Session files:', 'cyan')}           ${sessions.length}\n`);
  } catch {
    process.stdout.write(`  ${colorize('Session files:', 'cyan')}           ${dim('0')}\n`);
  }
  process.stdout.write('\n');

  // ─── Sentinel ────────────────────────────────────────────────────────────
  process.stdout.write(`  ${colorize('SENTINEL (KAIROS)', 'white', true)}\n`);

  // We can only show static info from config since Sentinel state is in-memory
  process.stdout.write(`  ${colorize('Tick interval:', 'cyan')}   ${dim('30s (default)')}\n`);

  // Check deferred actions file if it exists
  const deferredPath = join(baseDir, 'data', 'deferred.json');
  try {
    const deferredRaw = await readFile(deferredPath, 'utf8');
    const deferred = JSON.parse(deferredRaw) as unknown[];
    process.stdout.write(`  ${colorize('Deferred actions:', 'cyan')} ${deferred.length}\n`);
  } catch {
    process.stdout.write(`  ${colorize('Deferred actions:', 'cyan')} ${dim('0')}\n`);
  }

  process.stdout.write('\n');

  // ─── Principals ──────────────────────────────────────────────────────────
  process.stdout.write(`  ${colorize('PRINCIPALS', 'white', true)}\n`);
  printTable(
    [
      { header: 'Name', width: 20 },
      { header: 'Authority', width: 12 },
      { header: 'Contact', width: 30 },
    ],
    config.governor.principals.map((p) => [
      p.name,
      p.authority,
      p.contact,
    ]),
  );

  process.stdout.write('\n');
}
