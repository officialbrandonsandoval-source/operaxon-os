#!/usr/bin/env node
// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

import { printBanner, colorize, dim, exitWithError } from './helpers.js';
import { runInit } from './commands/init.js';
import { runStart } from './commands/start.js';
import { runStatus } from './commands/status.js';
import { runDeploy } from './commands/deploy.js';
import { runDream } from './commands/dream.js';
import { runAgent } from './commands/agent.js';
import { runMemory } from './commands/memory.js';
import { runTask } from './commands/task.js';
import { runSecrets } from './commands/secrets.js';

// ─── Version ─────────────────────────────────────────────────────────────────

const VERSION = '0.1.0';

// ─── Command registry ────────────────────────────────────────────────────────

interface CommandEntry {
  description: string;
  handler: (args: string[]) => Promise<void>;
}

const COMMANDS: Record<string, CommandEntry> = {
  init: {
    description: 'Initialize a new Operaxon civilization',
    handler: runInit,
  },
  start: {
    description: 'Start the Operaxon OS runtime',
    handler: runStart,
  },
  status: {
    description: 'Show civilization status and health',
    handler: runStatus,
  },
  deploy: {
    description: 'Deploy to Docker or VPS',
    handler: runDeploy,
  },
  dream: {
    description: 'Trigger memory consolidation (Meridian cycle)',
    handler: runDream,
  },
  agent: {
    description: 'Manage agents (add, list, remove)',
    handler: runAgent,
  },
  memory: {
    description: 'Inspect and manage memory store',
    handler: runMemory,
  },
  task: {
    description: 'Manage and inspect tasks',
    handler: runTask,
  },
  secrets: {
    description: 'Manage keychain secrets',
    handler: runSecrets,
  },
  help: {
    description: 'Show this help message',
    handler: showHelp,
  },
};

// ─── Help ────────────────────────────────────────────────────────────────────

async function showHelp(_args: string[]): Promise<void> {
  printBanner();

  process.stdout.write(`  ${dim(`v${VERSION}`)}\n\n`);
  process.stdout.write(`  ${colorize('USAGE', 'white', true)}\n`);
  process.stdout.write(`    operaxon ${dim('<command>')} ${dim('[options]')}\n\n`);
  process.stdout.write(`  ${colorize('COMMANDS', 'white', true)}\n`);

  const maxLen = Math.max(...Object.keys(COMMANDS).map((k) => k.length));

  for (const [name, entry] of Object.entries(COMMANDS)) {
    const paddedName = name.padEnd(maxLen + 2);
    process.stdout.write(`    ${colorize(paddedName, 'cyan')}${dim(entry.description)}\n`);
  }

  process.stdout.write(`\n  ${colorize('OPTIONS', 'white', true)}\n`);
  process.stdout.write(`    ${colorize('--version, -v', 'cyan')}   ${dim('Show version number')}\n`);
  process.stdout.write(`    ${colorize('--help, -h', 'cyan')}      ${dim('Show help for a command')}\n`);
  process.stdout.write('\n');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  // Handle version flag
  if (command === '--version' || command === '-v') {
    process.stdout.write(`operaxon v${VERSION}\n`);
    return;
  }

  // Handle help flag or no command
  if (!command || command === '--help' || command === '-h') {
    await showHelp([]);
    return;
  }

  // Look up command
  const entry = COMMANDS[command];

  if (!entry) {
    exitWithError(
      `Unknown command: ${colorize(command, 'yellow')}\n\n  Run ${colorize('operaxon help', 'cyan')} to see available commands.`,
    );
  }

  // Execute command with remaining args
  await entry.handler(args.slice(1));
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  exitWithError(message);
});
