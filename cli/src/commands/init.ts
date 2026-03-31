// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

import { mkdir, writeFile, access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { OperaxonConfig, ChannelType } from '@operaxon/types';
import {
  printBanner,
  readLine,
  colorize,
  dim,
  printSuccess,
  printInfo,
  printWarning,
  exitWithError,
  hasFlag,
} from '../helpers.js';

// ─── Channel options ─────────────────────────────────────────────────────────

const AVAILABLE_CHANNELS: readonly ChannelType[] = [
  'telegram',
  'discord',
  'slack',
  'signal',
  'webhook',
];

// ─── Init command ────────────────────────────────────────────────────────────

export async function runInit(args: string[]): Promise<void> {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    process.stdout.write(`
  ${colorize('operaxon init', 'white', true)}

  Initialize a new Operaxon civilization. Walks you through
  configuration and creates the project structure.

  ${colorize('OPTIONS', 'white', true)}
    ${colorize('--dir <path>', 'cyan')}   Output directory (default: current directory)

`);
    return;
  }

  printBanner();
  process.stdout.write(`  ${colorize('Civilization Setup Wizard', 'white', true)}\n`);
  process.stdout.write(`  ${dim('Answer the following questions to configure your civilization.')}\n\n`);

  // Step 1: Business name
  const businessName = await readLine(
    `  ${colorize('?', 'cyan', true)} Business name: `,
  );
  if (!businessName) {
    exitWithError('Business name is required.');
  }

  // Step 2: Owner name
  const ownerName = await readLine(
    `  ${colorize('?', 'cyan', true)} Owner name: `,
  );
  if (!ownerName) {
    exitWithError('Owner name is required.');
  }

  // Step 3: Owner contact
  const ownerContact = await readLine(
    `  ${colorize('?', 'cyan', true)} Owner contact (e.g. telegram:123456): `,
  );
  if (!ownerContact) {
    exitWithError('Owner contact is required.');
  }

  // Step 4: Primary model
  const modelDefault = 'claude-sonnet-4-20250514';
  const modelInput = await readLine(
    `  ${colorize('?', 'cyan', true)} Primary model ${dim(`(${modelDefault})`)}: `,
  );
  const model = modelInput || modelDefault;

  // Step 5: Channels
  process.stdout.write(`\n  ${colorize('Available channels:', 'white', true)}\n`);
  for (let i = 0; i < AVAILABLE_CHANNELS.length; i++) {
    const ch = AVAILABLE_CHANNELS[i];
    process.stdout.write(`    ${dim(`${i + 1}.`)} ${ch}\n`);
  }

  const channelsInput = await readLine(
    `\n  ${colorize('?', 'cyan', true)} Enable channels (comma-separated numbers, or blank for none): `,
  );

  const selectedChannels: ChannelType[] = [];
  if (channelsInput.trim()) {
    const indices = channelsInput.split(',').map((s) => parseInt(s.trim(), 10));
    for (const idx of indices) {
      if (idx >= 1 && idx <= AVAILABLE_CHANNELS.length) {
        const channel = AVAILABLE_CHANNELS[idx - 1];
        if (channel !== undefined) {
          selectedChannels.push(channel);
        }
      }
    }
  }

  // Generate deployment name (slug)
  const deploymentName = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Build config
  const config: OperaxonConfig = {
    governor: {
      name: deploymentName,
      model,
      memory: {
        storagePath: './data/memory',
        encryptionKeyRef: `${deploymentName}-memory-key`,
        maxMemoryLines: 200,
        consolidationInterval: 24,
        minSessionsBeforeConsolidation: 5,
      },
      principals: [
        {
          id: `principal-${randomUUID().slice(0, 8)}`,
          name: ownerName,
          contact: ownerContact,
          authority: 'sovereign',
        },
      ],
    },
    agents: [],
    channels: selectedChannels.map((type, i) => ({
      id: `channel-${type}-${i}`,
      type,
      enabled: true,
      credentials: `keychain:${deploymentName}-${type}-credentials`,
      options: {},
    })),
    runtime: {
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
    },
  };

  // Create directory structure
  const baseDir = join(homedir(), '.operaxon', deploymentName);
  const configDir = process.cwd();

  process.stdout.write(`\n  ${colorize('Creating directory structure...', 'white', true)}\n`);

  const dirs = [
    baseDir,
    join(baseDir, 'data'),
    join(baseDir, 'data', 'memory'),
    join(baseDir, 'data', 'memory', 'memories'),
    join(baseDir, 'data', 'logs'),
    join(baseDir, 'data', 'audit'),
    join(baseDir, 'data', 'sessions'),
  ];

  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
    printInfo(`Created ${dim(dir)}`);
  }

  // Write config file
  const configPath = join(configDir, 'operaxon.config.json');

  // Check if config already exists
  let configExists = false;
  try {
    await access(configPath, constants.F_OK);
    configExists = true;
  } catch {
    // Does not exist, which is expected
  }

  if (configExists) {
    const overwrite = await readLine(
      `\n  ${colorize('!', 'yellow', true)} Config file already exists. Overwrite? (y/N): `,
    );
    if (overwrite.toLowerCase() !== 'y') {
      printWarning('Skipped config file. Existing config preserved.');
      return;
    }
  }

  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  printInfo(`Wrote ${dim(configPath)}`);

  // Write initial memory state
  const statePath = join(baseDir, 'data', 'memory', 'state.json');
  const initialState = {
    lastConsolidation: null,
    sessionsSinceLastConsolidation: 0,
    isLocked: false,
    lockHolder: null,
    lockAcquiredAt: null,
  };
  await writeFile(statePath, JSON.stringify(initialState, null, 2) + '\n', 'utf8');
  printInfo(`Wrote ${dim(statePath)}`);

  // Write initial MEMORY.md
  const memoryIndexPath = join(baseDir, 'data', 'memory', 'MEMORY.md');
  const initialIndex = [
    '# Memory Index',
    '',
    '> Last consolidated: never',
    '> Total memories: 0',
    '',
  ].join('\n');
  await writeFile(memoryIndexPath, initialIndex + '\n', 'utf8');
  printInfo(`Wrote ${dim(memoryIndexPath)}`);

  // Print success
  printSuccess(`Civilization "${colorize(businessName, 'cyan', true)}" initialized.`);

  process.stdout.write(`
  ${colorize('Next steps:', 'white', true)}

    1. ${dim('Add your channel credentials to the OS keychain:')}
       ${colorize(`operaxon secrets set ${deploymentName}-<channel>-credentials`, 'cyan')}

    2. ${dim('Add agents to your civilization:')}
       ${colorize('operaxon agent add --name "Agent" --role "Role" --model "model"', 'cyan')}

    3. ${dim('Start your civilization:')}
       ${colorize('operaxon start', 'cyan')}

`);
}
