// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { OperaxonConfig } from '@operaxon/types';
import { Governor } from '@operaxon/governor';
import { Gateway, ChannelRegistry, CronEngine } from '@operaxon/runtime';
import { SentinelEngine } from '@operaxon/sentinel';
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

// ─── Start command ───────────────────────────────────────────────────────────

export async function runStart(args: string[]): Promise<void> {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    process.stdout.write(`
  ${colorize('operaxon start', 'white', true)}

  Start the Operaxon OS runtime. Loads configuration, initializes
  the Governor, starts the Gateway server, connects channels,
  and begins the Sentinel tick loop.

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

  const startTime = Date.now();

  process.stdout.write(`  ${colorize('Starting civilization:', 'white', true)} ${colorize(config.governor.name, 'cyan', true)}\n\n`);

  // Initialize Governor
  printInfo('Initializing Governor...');
  const governor = new Governor();
  try {
    const signingKey = Buffer.from(`${config.governor.name}-signing-key`);
    governor.initialize(config, signingKey);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    exitWithError(`Governor initialization failed:\n\n  ${message}`);
  }
  printInfo(`Governor ${colorize('online', 'green')}`);

  // Start Gateway server
  printInfo('Starting Gateway server...');
  const gateway = new Gateway(config.runtime);

  // Register health endpoint
  gateway.route('GET', '/health', async (_ctx, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      uptime: Date.now() - startTime,
      civilization: config.governor.name,
    }));
  });

  // Register status endpoint
  gateway.route('GET', '/status', async (_ctx, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      civilization: config.governor.name,
      uptime: formatDuration(Date.now() - startTime),
      agents: config.agents.length,
      channels: config.channels.filter((c) => c.enabled).length,
    }));
  });

  await gateway.start();
  printInfo(`Gateway listening on ${colorize(`http://${config.runtime.host}:${config.runtime.port}`, 'cyan')}`);

  // Connect channels
  const channelRegistry = new ChannelRegistry();
  const enabledChannels = config.channels.filter((c) => c.enabled);

  if (enabledChannels.length > 0) {
    printInfo(`Connecting ${enabledChannels.length} channel(s)...`);
    for (const channelConfig of enabledChannels) {
      channelRegistry.register(channelConfig);
      printInfo(`  ${colorize(channelConfig.type, 'cyan')} (${channelConfig.id})`);
    }
    try {
      await channelRegistry.connectAll();
      printInfo(`Channels ${colorize('connected', 'green')}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      printWarning(`Channel connection error: ${message}`);
    }
  } else {
    printInfo(dim('No channels configured.'));
  }

  // Start Sentinel (KAIROS) tick loop
  printInfo('Starting Sentinel (KAIROS) tick loop...');
  const sentinel = new SentinelEngine({
    tickIntervalMs: 30_000,
    blockingBudgetMs: 5_000,
    proactiveChecks: {
      email: false,
      calendar: false,
      agentCompletions: true,
      systemHealth: true,
      revenueMetrics: false,
    },
    silentHours: {
      enabled: false,
      start: '23:00',
      end: '07:00',
      timezone: 'UTC',
    },
  });

  sentinel.onTick((assessment) => {
    if (assessment.shouldAct && assessment.suggestedAction) {
      printInfo(
        `${dim('[KAIROS]')} Action: ${assessment.suggestedAction.description} ` +
        `(priority: ${assessment.priority})`,
      );
    }
  });

  sentinel.start();
  printInfo(`Sentinel ${colorize('active', 'green')} — tick every 30s`);

  // Start cron engine
  printInfo('Starting cron engine...');
  const cron = new CronEngine();
  cron.start();
  printInfo(`Cron engine ${colorize('active', 'green')}`);

  // Ready
  const bootTime = Date.now() - startTime;
  printSuccess(`Civilization "${colorize(config.governor.name, 'cyan', true)}" is online. (boot: ${formatDuration(bootTime)})`);

  process.stdout.write(`\n  ${dim('Press Ctrl+C to shut down gracefully.')}\n\n`);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    process.stdout.write(`\n  ${colorize(`Received ${signal}. Shutting down...`, 'yellow')}\n`);

    sentinel.stop();
    printInfo('Sentinel stopped.');

    cron.stop();
    printInfo('Cron engine stopped.');

    try {
      await channelRegistry.disconnectAll();
      printInfo('Channels disconnected.');
    } catch {
      printWarning('Some channels failed to disconnect cleanly.');
    }

    try {
      await gateway.stop();
      printInfo('Gateway stopped.');
    } catch {
      printWarning('Gateway failed to stop cleanly.');
    }

    const totalUptime = Date.now() - startTime;
    printSuccess(`Civilization shut down cleanly. Total uptime: ${formatDuration(totalUptime)}`);
    process.stdout.write('\n');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}
