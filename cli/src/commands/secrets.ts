// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

import { KeychainManager } from '@operaxon/security';
import {
  colorize,
  dim,
  readLine,
  printBanner,
  printSuccess,
  printInfo,
  printWarning,
  exitWithError,
  hasFlag,
} from '../helpers.js';

// ─── Secrets command ─────────────────────────────────────────────────────────

export async function runSecrets(args: string[]): Promise<void> {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    process.stdout.write(`
  ${colorize('operaxon secrets', 'white', true)}

  Manage secrets stored in the OS keychain.

  ${colorize('SUBCOMMANDS', 'white', true)}
    ${colorize('set <key>', 'cyan')}         Store a secret in the OS keychain
    ${colorize('get <key>', 'cyan')}         Retrieve a secret (shown as hex)
    ${colorize('delete <key>', 'cyan')}      Remove a secret from the keychain
    ${colorize('generate <key>', 'cyan')}    Generate and store a random 256-bit key

  ${colorize('EXAMPLES', 'white', true)}
    operaxon secrets set my-telegram-token
    operaxon secrets get my-telegram-token
    operaxon secrets delete my-telegram-token
    operaxon secrets generate my-memory-key

  ${colorize('SECURITY', 'white', true)}
    Secrets are stored in the OS keychain (macOS Keychain on darwin,
    file-based encrypted storage on Linux). They are never written
    to config files or plaintext logs.

`);
    return;
  }

  const subcommand = args[0];

  if (!subcommand || !['set', 'get', 'delete', 'generate'].includes(subcommand)) {
    exitWithError(
      `Unknown subcommand: ${subcommand ?? '(none)'}\n\n` +
      `  Run ${colorize('operaxon secrets --help', 'cyan')} for usage.`,
    );
  }

  printBanner();

  switch (subcommand) {
    case 'set':
      await secretsSet(args.slice(1));
      break;
    case 'get':
      await secretsGet(args.slice(1));
      break;
    case 'delete':
      await secretsDelete(args.slice(1));
      break;
    case 'generate':
      await secretsGenerate(args.slice(1));
      break;
  }
}

// ─── secrets set ─────────────────────────────────────────────────────────────

async function secretsSet(args: string[]): Promise<void> {
  const key = args[0];
  if (!key) {
    exitWithError('Secret key name is required.\n\n  Usage: operaxon secrets set <key>');
  }

  process.stdout.write(`  ${colorize('SET SECRET', 'white', true)}\n\n`);
  process.stdout.write(`  ${colorize('Key:', 'cyan')} ${key}\n\n`);

  printWarning('The value will be visible as you type.');
  const value = await readLine(`  ${colorize('?', 'cyan', true)} Secret value (hex-encoded): `);

  if (!value) {
    exitWithError('Secret value cannot be empty.');
  }

  try {
    const keychain = new KeychainManager();
    await keychain.setKey(key, Buffer.from(value, 'hex'));
    printSuccess(`Secret "${colorize(key, 'cyan')}" stored in OS keychain.`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    exitWithError(`Failed to store secret: ${message}`);
  }

  process.stdout.write('\n');
}

// ─── secrets get ─────────────────────────────────────────────────────────────

async function secretsGet(args: string[]): Promise<void> {
  const key = args[0];
  if (!key) {
    exitWithError('Secret key name is required.\n\n  Usage: operaxon secrets get <key>');
  }

  process.stdout.write(`  ${colorize('GET SECRET', 'white', true)}\n\n`);

  try {
    const keychain = new KeychainManager();
    const value = await keychain.getKey(key);
    const hex = value.toString('hex');

    // Mask all but last 8 hex characters
    const masked = hex.length > 8
      ? '*'.repeat(hex.length - 8) + hex.slice(-8)
      : '****';

    process.stdout.write(`  ${colorize('Key:', 'cyan')}    ${key}\n`);
    process.stdout.write(`  ${colorize('Value:', 'cyan')}  ${dim(masked)}\n`);
    process.stdout.write(`  ${colorize('Length:', 'cyan')} ${value.length} bytes\n`);
    printInfo(dim('Full value is stored in OS keychain. Displayed value is masked.'));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    exitWithError(`Failed to retrieve secret "${key}": ${message}`);
  }

  process.stdout.write('\n');
}

// ─── secrets delete ──────────────────────────────────────────────────────────

async function secretsDelete(args: string[]): Promise<void> {
  const key = args[0];
  if (!key) {
    exitWithError('Secret key name is required.\n\n  Usage: operaxon secrets delete <key>');
  }

  process.stdout.write(`  ${colorize('DELETE SECRET', 'white', true)}\n\n`);

  const confirm = await readLine(
    `  ${colorize('?', 'cyan', true)} Delete secret "${key}" from OS keychain? (y/N): `,
  );

  if (confirm.toLowerCase() !== 'y') {
    printInfo('Cancelled.');
    process.stdout.write('\n');
    return;
  }

  // KeychainManager doesn't have a delete method directly,
  // but on macOS we can overwrite with empty key, or re-set.
  // For now, we attempt to set a zero-length buffer as a soft delete.
  try {
    const keychain = new KeychainManager();
    await keychain.setKey(key, Buffer.alloc(0));
    printSuccess(`Secret "${colorize(key, 'cyan')}" cleared from OS keychain.`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    exitWithError(`Failed to delete secret: ${message}`);
  }

  process.stdout.write('\n');
}

// ─── secrets generate ────────────────────────────────────────────────────────

async function secretsGenerate(args: string[]): Promise<void> {
  const key = args[0];
  if (!key) {
    exitWithError('Secret key name is required.\n\n  Usage: operaxon secrets generate <key>');
  }

  process.stdout.write(`  ${colorize('GENERATE SECRET', 'white', true)}\n\n`);

  try {
    const keychain = new KeychainManager();
    const generated = await keychain.generateAndStoreKey(key);
    const hex = generated.toString('hex');

    // Mask all but last 8 hex characters
    const masked = hex.length > 8
      ? '*'.repeat(hex.length - 8) + hex.slice(-8)
      : '****';

    process.stdout.write(`  ${colorize('Key:', 'cyan')}       ${key}\n`);
    process.stdout.write(`  ${colorize('Generated:', 'cyan')} ${dim(masked)} (${generated.length} bytes)\n`);
    printSuccess(`Secret "${colorize(key, 'cyan')}" generated and stored in OS keychain.`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    exitWithError(`Failed to generate secret: ${message}`);
  }

  process.stdout.write('\n');
}
