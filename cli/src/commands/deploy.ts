// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

import { readFile, writeFile, access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { OperaxonConfig } from '@operaxon/types';
import {
  colorize,
  dim,
  printBanner,
  printSuccess,
  printInfo,
  printWarning,
  exitWithError,
  hasFlag,
  parseFlag,
} from '../helpers.js';

const execFileAsync = promisify(execFile);

// ─── Deployment targets ──────────────────────────────────────────────────────

type DeployTarget = 'docker' | 'vps';

// ─── Deploy command ──────────────────────────────────────────────────────────

export async function runDeploy(args: string[]): Promise<void> {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    process.stdout.write(`
  ${colorize('operaxon deploy', 'white', true)}

  Deploy your Operaxon civilization to a target environment.

  ${colorize('OPTIONS', 'white', true)}
    ${colorize('--target <docker|vps>', 'cyan')}   Deployment target (required)
    ${colorize('--host <hostname>', 'cyan')}        Remote host for VPS deployment
    ${colorize('--config <path>', 'cyan')}          Path to operaxon.config.json
    ${colorize('--tag <tag>', 'cyan')}              Docker image tag (default: latest)

  ${colorize('EXAMPLES', 'white', true)}
    operaxon deploy --target docker
    operaxon deploy --target docker --tag v0.1.0
    operaxon deploy --target vps --host user@myserver.com

`);
    return;
  }

  printBanner();

  // Parse target
  const targetRaw = parseFlag(args, '--target');
  if (!targetRaw) {
    exitWithError(
      `Deployment target is required.\n\n` +
      `  Use ${colorize('--target docker', 'cyan')} or ${colorize('--target vps', 'cyan')}`,
    );
  }

  if (targetRaw !== 'docker' && targetRaw !== 'vps') {
    exitWithError(
      `Invalid target: ${colorize(targetRaw, 'yellow')}\n\n` +
      `  Supported targets: ${colorize('docker', 'cyan')}, ${colorize('vps', 'cyan')}`,
    );
  }

  const target: DeployTarget = targetRaw;

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

  process.stdout.write(`  ${colorize('Deploying:', 'white', true)} ${config.governor.name}\n`);
  process.stdout.write(`  ${colorize('Target:', 'white', true)}    ${target}\n\n`);

  if (target === 'docker') {
    await deployDocker(args, config);
  } else {
    await deployVps(args, config);
  }
}

// ─── Docker deployment ───────────────────────────────────────────────────────

async function deployDocker(args: string[], config: OperaxonConfig): Promise<void> {
  const tag = parseFlag(args, '--tag') ?? 'latest';
  const imageName = `operaxon/${config.governor.name}:${tag}`;

  // Step 1: Generate Dockerfile if not present
  const dockerfilePath = join(process.cwd(), 'Dockerfile');
  let dockerfileExists = false;
  try {
    await access(dockerfilePath, constants.F_OK);
    dockerfileExists = true;
  } catch {
    // Expected
  }

  if (!dockerfileExists) {
    printInfo('Generating Dockerfile...');

    const dockerfile = [
      'FROM node:20-slim',
      '',
      'WORKDIR /app',
      '',
      'COPY package*.json ./',
      'RUN npm ci --omit=dev',
      '',
      'COPY . .',
      'RUN npm run build',
      '',
      'EXPOSE 3100',
      '',
      'ENV NODE_ENV=production',
      '',
      'HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \\',
      '  CMD curl -f http://localhost:3100/health || exit 1',
      '',
      'CMD ["node", "cli/dist/index.js", "start"]',
      '',
    ].join('\n');

    await writeFile(dockerfilePath, dockerfile, 'utf8');
    printInfo(`Generated ${dim(dockerfilePath)}`);
  } else {
    printInfo(`Using existing Dockerfile at ${dim(dockerfilePath)}`);
  }

  // Step 2: Validate Docker is available
  printInfo('Checking Docker availability...');
  try {
    await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}']);
  } catch {
    exitWithError(
      'Docker is not available or not running.\n\n' +
      '  Please install Docker and ensure the daemon is running.',
    );
  }
  printInfo(`Docker ${colorize('available', 'green')}`);

  // Step 3: Build image
  printInfo(`Building image: ${colorize(imageName, 'cyan')}...`);
  try {
    const buildResult = await execFileAsync('docker', [
      'build',
      '-t', imageName,
      '--build-arg', `NODE_ENV=production`,
      '.',
    ], { cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 });
    if (buildResult.stderr) {
      process.stdout.write(`  ${dim(buildResult.stderr.trim())}\n`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    exitWithError(`Docker build failed:\n\n  ${message}`);
  }
  printInfo(`Image ${colorize('built', 'green')}`);

  // Step 4: Start container
  const containerName = `operaxon-${config.governor.name}`;
  printInfo(`Starting container: ${colorize(containerName, 'cyan')}...`);

  // Stop existing container if running
  try {
    await execFileAsync('docker', ['stop', containerName]);
    await execFileAsync('docker', ['rm', containerName]);
    printInfo('Removed existing container.');
  } catch {
    // Container doesn't exist, that's fine
  }

  try {
    await execFileAsync('docker', [
      'run',
      '-d',
      '--name', containerName,
      '-p', `${config.runtime.port}:${config.runtime.port}`,
      '--restart', 'unless-stopped',
      imageName,
    ]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    exitWithError(`Failed to start container:\n\n  ${message}`);
  }

  printSuccess(`Deployed to Docker as ${colorize(containerName, 'cyan', true)}`);
  process.stdout.write(`\n  ${dim('Container is running on port')} ${colorize(String(config.runtime.port), 'cyan')}\n`);
  process.stdout.write(`  ${dim('View logs:')} ${colorize(`docker logs -f ${containerName}`, 'cyan')}\n\n`);
}

// ─── VPS deployment ──────────────────────────────────────────────────────────

async function deployVps(args: string[], config: OperaxonConfig): Promise<void> {
  const host = parseFlag(args, '--host');
  if (!host) {
    exitWithError(
      `VPS deployment requires ${colorize('--host', 'cyan')} flag.\n\n` +
      `  Example: ${colorize('operaxon deploy --target vps --host user@myserver.com', 'cyan')}`,
    );
  }

  // Step 1: Validate SSH access
  printInfo(`Validating SSH access to ${colorize(host, 'cyan')}...`);
  try {
    await execFileAsync('ssh', [
      '-o', 'ConnectTimeout=10',
      '-o', 'BatchMode=yes',
      host,
      'echo ok',
    ]);
  } catch {
    exitWithError(
      `Cannot connect to ${host} via SSH.\n\n` +
      `  Ensure SSH key-based authentication is set up:\n` +
      `    ssh-copy-id ${host}`,
    );
  }
  printInfo(`SSH access ${colorize('verified', 'green')}`);

  // Step 2: Create remote directory
  const remotePath = `/opt/operaxon/${config.governor.name}`;
  printInfo(`Creating remote directory: ${dim(remotePath)}...`);
  try {
    await execFileAsync('ssh', [host, `mkdir -p ${remotePath}`]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    exitWithError(`Failed to create remote directory:\n\n  ${message}`);
  }

  // Step 3: Rsync files
  printInfo('Syncing files...');
  try {
    const result = await execFileAsync('rsync', [
      '-avz',
      '--exclude', 'node_modules',
      '--exclude', 'dist',
      '--exclude', '.git',
      '--exclude', '.env',
      './',
      `${host}:${remotePath}/`,
    ], { cwd: process.cwd() });
    if (result.stderr) {
      process.stdout.write(`  ${dim(result.stderr.trim())}\n`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    exitWithError(`Rsync failed:\n\n  ${message}`);
  }
  printInfo(`Files ${colorize('synced', 'green')}`);

  // Step 4: Install dependencies and build remotely
  printInfo('Installing dependencies on remote...');
  try {
    await execFileAsync('ssh', [
      host,
      `cd ${remotePath} && npm ci && npm run build`,
    ]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    printWarning(`Remote build may have issues: ${message}`);
  }

  // Step 5: Start the service
  printInfo('Starting Operaxon on remote...');
  try {
    // Use nohup to keep it running after SSH disconnect
    await execFileAsync('ssh', [
      host,
      `cd ${remotePath} && nohup node cli/dist/index.js start > /tmp/operaxon.log 2>&1 &`,
    ]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    printWarning(`Remote start may need manual intervention: ${message}`);
  }

  printSuccess(`Deployed to VPS at ${colorize(host, 'cyan', true)}`);
  process.stdout.write(`\n  ${dim('Remote path:')} ${colorize(remotePath, 'cyan')}\n`);
  process.stdout.write(`  ${dim('View logs:')}  ${colorize(`ssh ${host} tail -f /tmp/operaxon.log`, 'cyan')}\n`);
  process.stdout.write(`  ${dim('For production, consider setting up a systemd service.')}\n\n`);
}
