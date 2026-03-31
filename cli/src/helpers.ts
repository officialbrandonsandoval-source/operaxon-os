// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

import { createInterface } from 'node:readline';

// ─── ANSI color codes ────────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

const COLORS: Record<Color, string> = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

export type Color = 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' | 'gray';

/**
 * Wrap text in ANSI color escape codes.
 */
export function colorize(text: string, color: Color, bold = false): string {
  const prefix = bold ? `${BOLD}${COLORS[color]}` : COLORS[color];
  return `${prefix}${text}${RESET}`;
}

/**
 * Wrap text in dim ANSI escape codes.
 */
export function dim(text: string): string {
  return `${DIM}${text}${RESET}`;
}

// ─── Banner ──────────────────────────────────────────────────────────────────

/**
 * Print the Operaxon OS ASCII art banner.
 */
export function printBanner(): void {
  const banner = `
${colorize('  ╔═══════════════════════════════════════════╗', 'cyan', true)}
${colorize('  ║', 'cyan', true)}                                           ${colorize('║', 'cyan', true)}
${colorize('  ║', 'cyan', true)}   ${colorize('OPERAXON', 'white', true)} ${colorize('OS', 'cyan', true)}                            ${colorize('║', 'cyan', true)}
${colorize('  ║', 'cyan', true)}   ${dim('The operating system for agentic business')} ${colorize('║', 'cyan', true)}
${colorize('  ║', 'cyan', true)}                                           ${colorize('║', 'cyan', true)}
${colorize('  ╚═══════════════════════════════════════════╝', 'cyan', true)}
`;
  process.stdout.write(banner);
}

// ─── Table output ────────────────────────────────────────────────────────────

interface TableColumn {
  header: string;
  width: number;
}

/**
 * Print a formatted table to stdout.
 */
export function printTable(columns: TableColumn[], rows: string[][]): void {
  // Header row
  const headerLine = columns
    .map((col) => col.header.padEnd(col.width))
    .join('  ');
  process.stdout.write(`  ${colorize(headerLine, 'cyan', true)}\n`);

  // Separator
  const separator = columns.map((col) => '─'.repeat(col.width)).join('──');
  process.stdout.write(`  ${dim(separator)}\n`);

  // Data rows
  for (const row of rows) {
    const line = columns
      .map((col, i) => {
        const cell = row[i] ?? '';
        return cell.length > col.width
          ? cell.slice(0, col.width - 1) + '…'
          : cell.padEnd(col.width);
      })
      .join('  ');
    process.stdout.write(`  ${line}\n`);
  }
}

// ─── Readline helper ─────────────────────────────────────────────────────────

/**
 * Read a single line of input from stdin with a prompt.
 */
export function readLine(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ─── Duration formatting ─────────────────────────────────────────────────────

/**
 * Format a duration in milliseconds into a human-readable string.
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

// ─── Error formatting ────────────────────────────────────────────────────────

/**
 * Print a user-friendly error message and exit.
 */
export function exitWithError(message: string, code = 1): never {
  process.stderr.write(`\n  ${colorize('Error:', 'red', true)} ${message}\n\n`);
  process.exit(code);
}

/**
 * Print a success message.
 */
export function printSuccess(message: string): void {
  process.stdout.write(`\n  ${colorize('✓', 'green', true)} ${message}\n`);
}

/**
 * Print an info message.
 */
export function printInfo(message: string): void {
  process.stdout.write(`  ${colorize('›', 'blue')} ${message}\n`);
}

/**
 * Print a warning message.
 */
export function printWarning(message: string): void {
  process.stdout.write(`  ${colorize('!', 'yellow', true)} ${message}\n`);
}

// ─── Argument parsing helpers ────────────────────────────────────────────────

/**
 * Parse a named flag value from argv. Returns undefined if not found.
 */
export function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

/**
 * Check if a boolean flag is present in argv.
 */
export function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}
