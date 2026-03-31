// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { OperaxonConfig, AgentConfig } from '@operaxon/types';
import {
  colorize,
  dim,
  printBanner,
  printTable,
  printSuccess,
  exitWithError,
  hasFlag,
  parseFlag,
} from '../helpers.js';

// ─── Agent command ───────────────────────────────────────────────────────────

export async function runAgent(args: string[]): Promise<void> {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    process.stdout.write(`
  ${colorize('operaxon agent', 'white', true)}

  Manage agents in your Operaxon civilization.

  ${colorize('SUBCOMMANDS', 'white', true)}
    ${colorize('add', 'cyan')}      Add a new agent
    ${colorize('list', 'cyan')}     List all configured agents
    ${colorize('remove', 'cyan')}   Remove an agent

  ${colorize('OPTIONS (add)', 'white', true)}
    ${colorize('--name <name>', 'cyan')}     Agent display name (required)
    ${colorize('--role <role>', 'cyan')}     Agent role description (required)
    ${colorize('--model <model>', 'cyan')}   LLM model to use (required)
    ${colorize('--domains <d1,d2>', 'cyan')} Comma-separated domain list
    ${colorize('--memory <mode>', 'cyan')}   Memory mode: shared or isolated (default: shared)

  ${colorize('OPTIONS (remove)', 'white', true)}
    ${colorize('--name <name>', 'cyan')}     Agent name to remove (required)

  ${colorize('EXAMPLES', 'white', true)}
    operaxon agent add --name "Scout" --role "Research assistant" --model "claude-sonnet-4-20250514"
    operaxon agent list
    operaxon agent remove --name "Scout"

`);
    return;
  }

  const subcommand = args[0];

  if (!subcommand || !['add', 'list', 'remove'].includes(subcommand)) {
    exitWithError(
      `Unknown subcommand: ${subcommand ?? '(none)'}\n\n` +
      `  Run ${colorize('operaxon agent --help', 'cyan')} for usage.`,
    );
  }

  switch (subcommand) {
    case 'add':
      await agentAdd(args.slice(1));
      break;
    case 'list':
      await agentList(args.slice(1));
      break;
    case 'remove':
      await agentRemove(args.slice(1));
      break;
  }
}

// ─── Load / save config ─────────────────────────────────────────────────────

async function loadConfigFile(args: string[]): Promise<{ config: OperaxonConfig; path: string }> {
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

  return { config, path: configPath };
}

async function saveConfigFile(config: OperaxonConfig, path: string): Promise<void> {
  await writeFile(path, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

// ─── agent add ───────────────────────────────────────────────────────────────

async function agentAdd(args: string[]): Promise<void> {
  printBanner();

  const name = parseFlag(args, '--name');
  const role = parseFlag(args, '--role');
  const model = parseFlag(args, '--model');
  const domainsRaw = parseFlag(args, '--domains');
  const memoryMode = parseFlag(args, '--memory');

  if (!name) exitWithError('Agent name is required. Use --name "Name"');
  if (!role) exitWithError('Agent role is required. Use --role "Role"');
  if (!model) exitWithError('Agent model is required. Use --model "model"');

  const { config, path } = await loadConfigFile(args);

  // Check for duplicate name
  const existing = config.agents.find((a) => a.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    exitWithError(`An agent named "${name}" already exists.`);
  }

  const domains = domainsRaw ? domainsRaw.split(',').map((d) => d.trim()) : [];
  const memory: 'shared' | 'isolated' = memoryMode === 'isolated' ? 'isolated' : 'shared';

  const agentConfig: AgentConfig = {
    id: `agent-${randomUUID().slice(0, 8)}`,
    name,
    role,
    model,
    domains,
    tools: [],
    memory,
    containment: {
      allowedTools: [],
      deniedTools: [],
      maxConcurrentActions: 3,
      requiresApproval: [],
      clearanceLevel: 3,
    },
  };

  config.agents.push(agentConfig);
  await saveConfigFile(config, path);

  printSuccess(`Agent "${colorize(name, 'cyan', true)}" added.`);
  process.stdout.write('\n');
  process.stdout.write(`  ${colorize('ID:', 'cyan')}      ${agentConfig.id}\n`);
  process.stdout.write(`  ${colorize('Role:', 'cyan')}    ${role}\n`);
  process.stdout.write(`  ${colorize('Model:', 'cyan')}   ${model}\n`);
  process.stdout.write(`  ${colorize('Memory:', 'cyan')}  ${memory}\n`);
  process.stdout.write(`  ${colorize('Domains:', 'cyan')} ${domains.length > 0 ? domains.join(', ') : dim('none')}\n`);
  process.stdout.write('\n');
}

// ─── agent list ──────────────────────────────────────────────────────────────

async function agentList(args: string[]): Promise<void> {
  printBanner();

  const { config } = await loadConfigFile(args);

  process.stdout.write(`  ${colorize('AGENTS', 'white', true)} ${dim(`(${config.agents.length} configured)`)}\n\n`);

  if (config.agents.length === 0) {
    process.stdout.write(`  ${dim('No agents configured.')}\n`);
    process.stdout.write(`  ${dim('Run')} ${colorize('operaxon agent add --name "Name" --role "Role" --model "model"', 'cyan')}\n\n`);
    return;
  }

  printTable(
    [
      { header: 'ID', width: 16 },
      { header: 'Name', width: 18 },
      { header: 'Role', width: 22 },
      { header: 'Model', width: 26 },
      { header: 'Memory', width: 10 },
      { header: 'Clearance', width: 10 },
    ],
    config.agents.map((a) => [
      a.id,
      a.name,
      a.role,
      a.model,
      a.memory,
      String(a.containment.clearanceLevel),
    ]),
  );

  process.stdout.write('\n');
}

// ─── agent remove ────────────────────────────────────────────────────────────

async function agentRemove(args: string[]): Promise<void> {
  printBanner();

  const name = parseFlag(args, '--name');
  if (!name) {
    exitWithError('Agent name is required. Use --name "Name"');
  }

  const { config, path } = await loadConfigFile(args);

  const idx = config.agents.findIndex((a) => a.name.toLowerCase() === name.toLowerCase());
  if (idx === -1) {
    exitWithError(`No agent named "${name}" found.`);
  }

  const removed = config.agents[idx];
  config.agents.splice(idx, 1);
  await saveConfigFile(config, path);

  if (removed) {
    printSuccess(`Agent "${colorize(removed.name, 'cyan', true)}" (${removed.id}) removed.`);
  }
  process.stdout.write('\n');
}
