// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { OperaxonConfig, MeridianConfig } from '@operaxon/types';
import { MeridianEngine, type ConsolidationResult } from '@operaxon/meridian';
import { AuditLog } from '@operaxon/security';
import {
  colorize,
  dim,
  printBanner,
  printSuccess,
  printInfo,
  printWarning,
  exitWithError,
  formatDuration,
  hasFlag,
  parseFlag,
} from '../helpers.js';

// ─── Dream command ───────────────────────────────────────────────────────────

export async function runDream(args: string[]): Promise<void> {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    process.stdout.write(`
  ${colorize('operaxon dream', 'white', true)}

  Trigger immediate memory consolidation (the Meridian cycle).
  Runs through all four phases: Orient, Gather, Consolidate, Prune.

  ${colorize('SUBCOMMANDS', 'white', true)}
    ${colorize('run', 'cyan')}     Run consolidation now (default)
    ${colorize('status', 'cyan')}  Show current Meridian state

  ${colorize('OPTIONS', 'white', true)}
    ${colorize('--config <path>', 'cyan')}   Path to operaxon.config.json
    ${colorize('--force', 'cyan')}           Skip gate checks and force consolidation

`);
    return;
  }

  const subcommand = args[0] === 'run' || args[0] === 'status' ? args[0] : 'run';

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

  if (subcommand === 'status') {
    await showDreamStatus(config);
    return;
  }

  await runDreamCycle(args, config);
}

// ─── Dream status ────────────────────────────────────────────────────────────

async function showDreamStatus(config: OperaxonConfig): Promise<void> {
  process.stdout.write(`  ${colorize('MERIDIAN STATUS', 'white', true)}\n\n`);

  const meridianConfig = buildMeridianConfig(config);
  const auditSigningKey = Buffer.from(`${config.governor.name}-audit-signing-key`);
  const auditLog = new AuditLog('./data/audit', auditSigningKey);

  const engine = new MeridianEngine({ config: meridianConfig, audit: auditLog });
  const gateResult = await engine.shouldConsolidate();

  const timeInfo = `${gateResult.time.hoursSinceLast.toFixed(1)}h / ${gateResult.time.requiredHours}h required`;
  const sessionInfo = `${gateResult.session.sessionCount} / ${gateResult.session.requiredSessions} required`;
  const lockInfo = gateResult.lock.reason ?? (gateResult.lock.acquired ? 'available' : 'held');
  process.stdout.write(`  ${colorize('Time gate:', 'cyan')}      ${gateResult.time.passed ? colorize('PASS', 'green') : colorize('WAIT', 'yellow')} ${dim(`(${timeInfo})`)}\n`);
  process.stdout.write(`  ${colorize('Session gate:', 'cyan')}   ${gateResult.session.passed ? colorize('PASS', 'green') : colorize('WAIT', 'yellow')} ${dim(`(${sessionInfo})`)}\n`);
  process.stdout.write(`  ${colorize('Lock gate:', 'cyan')}      ${gateResult.lock.acquired ? colorize('PASS', 'green') : colorize('LOCKED', 'red')} ${dim(`(${lockInfo})`)}\n`);
  process.stdout.write(`\n  ${colorize('Ready to dream:', 'white', true)} ${gateResult.allPassed ? colorize('YES', 'green', true) : colorize('NO', 'yellow', true)}\n\n`);
}

// ─── Run dream cycle ─────────────────────────────────────────────────────────

async function runDreamCycle(args: string[], config: OperaxonConfig): Promise<void> {
  const force = hasFlag(args, '--force');

  process.stdout.write(`  ${colorize('MERIDIAN CYCLE', 'white', true)} ${dim('— Memory Consolidation')}\n`);
  process.stdout.write(`  ${dim('Civilization:')} ${config.governor.name}\n\n`);

  const meridianConfig = buildMeridianConfig(config);
  const auditSigningKey = Buffer.from(`${config.governor.name}-audit-signing-key`);
  const auditLog = new AuditLog('./data/audit', auditSigningKey);

  const engine = new MeridianEngine({ config: meridianConfig, audit: auditLog });

  // Check gates (unless forced)
  if (!force) {
    printInfo('Checking gates...');
    const gateResult = await engine.shouldConsolidate();

    if (!gateResult.allPassed) {
      process.stdout.write(`\n  ${colorize('Gates not passed:', 'yellow', true)}\n`);
      if (!gateResult.time.passed) {
        process.stdout.write(`    Time:    ${dim(`${gateResult.time.hoursSinceLast.toFixed(1)}h elapsed, ${gateResult.time.requiredHours}h required`)}\n`);
      }
      if (!gateResult.session.passed) {
        process.stdout.write(`    Session: ${dim(`${gateResult.session.sessionCount} sessions, ${gateResult.session.requiredSessions} required`)}\n`);
      }
      if (!gateResult.lock.acquired) {
        process.stdout.write(`    Lock:    ${dim(gateResult.lock.reason ?? 'Lock held by another process')}\n`);
      }
      process.stdout.write(`\n  ${dim('Use')} ${colorize('--force', 'cyan')} ${dim('to bypass gate checks.')}\n\n`);
      return;
    }

    printInfo(`Gates ${colorize('passed', 'green')} — starting consolidation`);
  } else {
    printWarning('Bypassing gate checks (--force)');
  }

  // Run consolidation
  const startTime = Date.now();

  process.stdout.write('\n');
  printPhaseStart('Phase 1: Orient');
  printPhaseStart('Phase 2: Gather');
  printPhaseStart('Phase 3: Consolidate');
  printPhaseStart('Phase 4: Prune & Index');

  let result: ConsolidationResult;
  try {
    result = await engine.consolidate();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    exitWithError(`Consolidation failed: ${message}`);
  }

  const elapsed = Date.now() - startTime;

  // Report results
  process.stdout.write(`\n  ${colorize('RESULTS', 'white', true)}\n`);

  for (const phase of result.phases) {
    const statusIcon = phase.status === 'completed'
      ? colorize('DONE', 'green')
      : phase.status === 'failed'
        ? colorize('FAIL', 'red')
        : colorize(phase.status.toUpperCase(), 'yellow');

    process.stdout.write(`    ${phase.name.padEnd(14)} ${statusIcon}`);
    if (phase.error) {
      process.stdout.write(` ${dim(phase.error)}`);
    }
    process.stdout.write('\n');
  }

  process.stdout.write('\n');
  process.stdout.write(`  ${colorize('Memories created:', 'cyan')}  ${result.memoriesCreated}\n`);
  process.stdout.write(`  ${colorize('Memories updated:', 'cyan')}  ${result.memoriesUpdated}\n`);
  process.stdout.write(`  ${colorize('Memories deleted:', 'cyan')}  ${result.memoriesDeleted}\n`);
  process.stdout.write(`  ${colorize('Signals processed:', 'cyan')} ${result.signalsProcessed}\n`);
  process.stdout.write(`  ${colorize('Index lines:', 'cyan')}       ${result.indexLinesBefore} -> ${result.indexLinesAfter}\n`);
  process.stdout.write(`  ${colorize('Duration:', 'cyan')}          ${formatDuration(elapsed)}\n`);

  if (result.errors.length > 0) {
    process.stdout.write(`\n  ${colorize('Errors:', 'red', true)}\n`);
    for (const error of result.errors) {
      process.stdout.write(`    ${dim('-')} ${error}\n`);
    }
  }

  if (result.success) {
    printSuccess('Dream cycle completed successfully.');
  } else {
    printWarning('Dream cycle completed with errors.');
  }

  process.stdout.write('\n');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildMeridianConfig(config: OperaxonConfig): MeridianConfig {
  return {
    timeGateHours: config.governor.memory.consolidationInterval,
    sessionGateCount: config.governor.memory.minSessionsBeforeConsolidation,
    maxMemoryLines: config.governor.memory.maxMemoryLines,
    maxMemoryBytes: 512 * 1024, // 512KB default
    storagePath: config.governor.memory.storagePath,
    encryptionKeyRef: config.governor.memory.encryptionKeyRef,
  };
}

function printPhaseStart(name: string): void {
  process.stdout.write(`  ${colorize('>', 'cyan')} ${name}...\n`);
}
