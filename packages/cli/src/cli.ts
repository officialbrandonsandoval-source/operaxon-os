#!/usr/bin/env node

/**
 * Operaxon CLI — Unified slash command interface
 * 
 * Usage:
 *   operaxon search "find mentions of Ethan"
 *   operaxon execute "print('hello')"
 *   operaxon build "Create a REST API"
 *   operaxon audit "const x = eval(code)"
 *   operaxon help [command]
 */

import { parser } from './slash-commands.js';
import * as readline from 'readline';

async function main() {
  const args = process.argv.slice(2);

  // If called with arguments, execute immediately
  if (args.length > 0) {
    const command = args[0];
    const input = `/`${command} ${args.slice(1).join(' ')}`;
    const result = await parser.execute(input);
    console.log(result);
    process.exit(0);
  }

  // Otherwise, run interactive mode
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'operaxon> ',
  });

  console.log('🚀 Operaxon CLI v1.0.0');
  console.log('Type /help for available commands, or /exit to quit\n');

  rl.prompt();

  rl.on('line', async (line: string) => {
    const input = line.trim();

    if (input === '/exit' || input === 'exit') {
      console.log('Goodbye!');
      process.exit(0);
    }

    if (input === '' || !input.startsWith('/')) {
      if (input) {
        console.log('Commands must start with /. Type /help for available commands.');
      }
      rl.prompt();
      return;
    }

    try {
      const result = await parser.execute(input);
      console.log(result);
    } catch (error) {
      console.error(`Error: ${error}`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('Goodbye!');
    process.exit(0);
  });
}

main().catch(console.error);
