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
  printInfo,
  exitWithError,
  hasFlag,
  parseFlag,
} from '../helpers.js';

// ─── Memory command ──────────────────────────────────────────────────────────

export async function runMemory(args: string[]): Promise<void> {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    process.stdout.write(`
  ${colorize('operaxon memory', 'white', true)}

  Inspect and manage the memory store.

  ${colorize('SUBCOMMANDS', 'white', true)}
    ${colorize('list', 'cyan')}     List all memory files
    ${colorize('show', 'cyan')}     Show the memory index (MEMORY.md)
    ${colorize('stats', 'cyan')}    Show memory statistics

  ${colorize('OPTIONS', 'white', true)}
    ${colorize('--config <path>', 'cyan')}   Path to operaxon.config.json

`);
    return;
  }

  const subcommand = args[0] ?? 'stats';

  printBanner();

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
  const memoryDir = join(baseDir, 'data', 'memory');

  switch (subcommand) {
    case 'list':
      await memoryList(memoryDir);
      break;
    case 'show':
      await memoryShow(memoryDir);
      break;
    case 'stats':
      await memoryStats(memoryDir, config);
      break;
    default:
      exitWithError(
        `Unknown subcommand: ${subcommand}\n\n` +
        `  Run ${colorize('operaxon memory --help', 'cyan')} for usage.`,
      );
  }
}

// ─── memory list ─────────────────────────────────────────────────────────────

async function memoryList(memoryDir: string): Promise<void> {
  process.stdout.write(`  ${colorize('MEMORY FILES', 'white', true)}\n\n`);

  const memoriesDir = join(memoryDir, 'memories');
  let files: string[];
  try {
    files = await readdir(memoriesDir);
  } catch {
    process.stdout.write(`  ${dim('No memories directory found.')}\n\n`);
    return;
  }

  const memFiles = files.filter((f) => f.endsWith('.mem'));

  if (memFiles.length === 0) {
    process.stdout.write(`  ${dim('No memory files found.')}\n`);
    process.stdout.write(`  ${dim('Run')} ${colorize('operaxon dream run', 'cyan')} ${dim('to consolidate memories.')}\n\n`);
    return;
  }

  printTable(
    [
      { header: 'File', width: 40 },
      { header: 'Size', width: 12 },
    ],
    await Promise.all(
      memFiles.map(async (f) => {
        const filePath = join(memoriesDir, f);
        try {
          const content = await readFile(filePath, 'utf8');
          const sizeKb = (Buffer.byteLength(content, 'utf8') / 1024).toFixed(1);
          return [f, `${sizeKb} KB`];
        } catch {
          return [f, dim('error')];
        }
      }),
    ),
  );

  process.stdout.write(`\n  ${dim(`Total: ${memFiles.length} file(s)`)}\n\n`);
}

// ─── memory show ─────────────────────────────────────────────────────────────

async function memoryShow(memoryDir: string): Promise<void> {
  const indexPath = join(memoryDir, 'MEMORY.md');

  let content: string;
  try {
    content = await readFile(indexPath, 'utf8');
  } catch {
    process.stdout.write(`  ${dim('No memory index found.')}\n`);
    process.stdout.write(`  ${dim('Run')} ${colorize('operaxon dream run', 'cyan')} ${dim('to generate one.')}\n\n`);
    return;
  }

  process.stdout.write(`  ${colorize('MEMORY INDEX', 'white', true)}\n`);
  process.stdout.write(`  ${dim(indexPath)}\n\n`);

  // Print with light formatting
  for (const line of content.split('\n')) {
    if (line.startsWith('# ')) {
      process.stdout.write(`  ${colorize(line, 'white', true)}\n`);
    } else if (line.startsWith('## ')) {
      process.stdout.write(`  ${colorize(line, 'cyan', true)}\n`);
    } else if (line.startsWith('>')) {
      process.stdout.write(`  ${dim(line)}\n`);
    } else {
      process.stdout.write(`  ${line}\n`);
    }
  }

  process.stdout.write('\n');
}

// ─── memory stats ────────────────────────────────────────────────────────────

async function memoryStats(memoryDir: string, config: OperaxonConfig): Promise<void> {
  process.stdout.write(`  ${colorize('MEMORY STATISTICS', 'white', true)}\n\n`);

  // State
  const statePath = join(memoryDir, 'state.json');
  let state: MeridianState | null = null;
  try {
    const stateRaw = await readFile(statePath, 'utf8');
    state = JSON.parse(stateRaw) as MeridianState;
  } catch {
    // No state file
  }

  if (state) {
    const lastConsolidation = state.lastConsolidation
      ? new Date(state.lastConsolidation).toLocaleString()
      : dim('never');
    process.stdout.write(`  ${colorize('Last consolidation:', 'cyan')}      ${lastConsolidation}\n`);
    process.stdout.write(`  ${colorize('Sessions since last:', 'cyan')}     ${state.sessionsSinceLastConsolidation}\n`);
    process.stdout.write(`  ${colorize('Lock status:', 'cyan')}             ${state.isLocked ? colorize('locked', 'yellow') : colorize('unlocked', 'green')}\n`);
  } else {
    printInfo(dim('No state file found.'));
  }

  // Memory file count and total size
  const memoriesDir = join(memoryDir, 'memories');
  let totalFiles = 0;
  let totalBytes = 0;
  try {
    const files = await readdir(memoriesDir);
    const memFiles = files.filter((f) => f.endsWith('.mem'));
    totalFiles = memFiles.length;
    for (const f of memFiles) {
      try {
        const content = await readFile(join(memoriesDir, f), 'utf8');
        totalBytes += Buffer.byteLength(content, 'utf8');
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // No memories dir
  }

  process.stdout.write(`  ${colorize('Memory files:', 'cyan')}             ${totalFiles}\n`);
  process.stdout.write(`  ${colorize('Total size:', 'cyan')}               ${(totalBytes / 1024).toFixed(1)} KB\n`);
  process.stdout.write(`  ${colorize('Max memory lines:', 'cyan')}         ${config.governor.memory.maxMemoryLines}\n`);
  process.stdout.write(`  ${colorize('Consolidation interval:', 'cyan')}   ${config.governor.memory.consolidationInterval}h\n`);
  process.stdout.write(`  ${colorize('Min sessions threshold:', 'cyan')}   ${config.governor.memory.minSessionsBeforeConsolidation}\n`);

  // Index stats
  const indexPath = join(memoryDir, 'MEMORY.md');
  try {
    const index = await readFile(indexPath, 'utf8');
    const lines = index.split('\n').length;
    process.stdout.write(`  ${colorize('Index lines:', 'cyan')}              ${lines} / ${config.governor.memory.maxMemoryLines}\n`);
  } catch {
    process.stdout.write(`  ${colorize('Index:', 'cyan')}                    ${dim('not generated')}\n`);
  }

  process.stdout.write('\n');
}
