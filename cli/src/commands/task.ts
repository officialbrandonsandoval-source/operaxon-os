// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { OperaxonConfig } from '@operaxon/types';
import {
  colorize,
  dim,
  printBanner,
  printInfo,
  exitWithError,
  hasFlag,
  parseFlag,
} from '../helpers.js';

// ─── Task command ────────────────────────────────────────────────────────────

export async function runTask(args: string[]): Promise<void> {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    process.stdout.write(`
  ${colorize('operaxon task', 'white', true)}

  Manage and inspect tasks in the coordinator pipeline.

  ${colorize('SUBCOMMANDS', 'white', true)}
    ${colorize('list', 'cyan')}     List pending and recent tasks
    ${colorize('status', 'cyan')}   Show status of a specific task
    ${colorize('cancel', 'cyan')}   Cancel a pending task

  ${colorize('OPTIONS', 'white', true)}
    ${colorize('--id <task-id>', 'cyan')}    Task ID (for status/cancel)
    ${colorize('--config <path>', 'cyan')}   Path to operaxon.config.json

`);
    return;
  }

  const subcommand = args[0] ?? 'list';

  printBanner();

  // Load config to verify we're in an initialized project
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

  switch (subcommand) {
    case 'list':
      await taskList(config);
      break;
    case 'status':
      await taskStatus(args.slice(1));
      break;
    case 'cancel':
      await taskCancel(args.slice(1));
      break;
    default:
      exitWithError(
        `Unknown subcommand: ${subcommand}\n\n` +
        `  Run ${colorize('operaxon task --help', 'cyan')} for usage.`,
      );
  }
}

// ─── task list ───────────────────────────────────────────────────────────────

async function taskList(config: OperaxonConfig): Promise<void> {
  process.stdout.write(`  ${colorize('TASKS', 'white', true)} ${dim(`— ${config.governor.name}`)}\n\n`);

  // Query the running runtime for task status
  try {
    const response = await fetch(
      `http://${config.runtime.host}:${config.runtime.port}/status`,
    );

    if (!response.ok) {
      printInfo(dim('Runtime is not responding. Start the server to see live tasks.'));
      printInfo(`Run ${colorize('operaxon start', 'cyan')} to start the runtime.`);
      process.stdout.write('\n');
      return;
    }

    const status = (await response.json()) as { agents: number; channels: number };
    process.stdout.write(`  ${dim('Runtime is online.')}\n`);
    process.stdout.write(`  ${colorize('Agents:', 'cyan')}   ${status.agents}\n`);
    process.stdout.write(`  ${colorize('Channels:', 'cyan')} ${status.channels}\n\n`);

    // In a full implementation, we'd query a /tasks endpoint
    printInfo(dim('Task tracking requires a running runtime with the coordinator module.'));
    printInfo(dim('No task queue endpoints are registered yet in v0.1.'));
  } catch {
    printInfo(dim('Runtime is not reachable. No live task data available.'));
    printInfo(`Run ${colorize('operaxon start', 'cyan')} to start the runtime.`);
  }

  process.stdout.write('\n');
}

// ─── task status ─────────────────────────────────────────────────────────────

async function taskStatus(args: string[]): Promise<void> {
  const taskId = parseFlag(args, '--id');
  if (!taskId) {
    exitWithError('Task ID is required. Use --id <task-id>');
  }

  process.stdout.write(`  ${colorize('TASK STATUS', 'white', true)}\n\n`);
  process.stdout.write(`  ${colorize('ID:', 'cyan')} ${taskId}\n\n`);

  printInfo(dim('Task inspection requires a running runtime.'));
  printInfo(dim('This feature will query the coordinator engine in a future release.'));
  process.stdout.write('\n');
}

// ─── task cancel ─────────────────────────────────────────────────────────────

async function taskCancel(args: string[]): Promise<void> {
  const taskId = parseFlag(args, '--id');
  if (!taskId) {
    exitWithError('Task ID is required. Use --id <task-id>');
  }

  process.stdout.write(`  ${colorize('CANCEL TASK', 'white', true)}\n\n`);
  process.stdout.write(`  ${colorize('ID:', 'cyan')} ${taskId}\n\n`);

  printInfo(dim('Task cancellation requires a running runtime.'));
  printInfo(dim('This feature will be available in a future release.'));
  process.stdout.write('\n');
}
