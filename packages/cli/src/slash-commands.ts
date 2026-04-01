/**
 * Unified Slash Commands — Phase 5D
 * 
 * Single command interface across:
 * - CLI: operaxon search "..."
 * - Telegram: /search "..."
 * - Discord: /search ...
 * - Slack: /operaxon search ...
 */

import { searchEngine } from '@operaxon/hermes';

export interface SlashCommand {
  name: string;
  description: string;
  usage: string;
  handler: (args: string[]) => Promise<string>;
  examples: string[];
}

export class SlashCommandParser {
  private commands: Map<string, SlashCommand> = new Map();

  /**
   * Register a slash command
   */
  register(command: SlashCommand): void {
    this.commands.set(command.name, command);
  }

  /**
   * Parse and execute a command
   */
  async execute(input: string): Promise<string> {
    // Parse: /search "find mentions of Ethan" --top-k 5
    const parts = input.trim().split(/\s+(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    const commandName = parts[0].replace(/^\//, '');
    const args = parts.slice(1);

    const command = this.commands.get(commandName);
    if (!command) {
      return `❌ Command not found: /${commandName}\n\nAvailable commands:\n${this.listCommands()}`;
    }

    try {
      return await command.handler(args);
    } catch (error) {
      return `❌ Error executing /${commandName}: ${error}`;
    }
  }

  /**
   * List all commands
   */
  listCommands(): string {
    let output = '';
    for (const [name, cmd] of this.commands) {
      output += `  /${name} — ${cmd.description}\n`;
    }
    return output;
  }

  /**
   * Get help for a command
   */
  getHelp(commandName: string): string {
    const command = this.commands.get(commandName);
    if (!command) {
      return `Command not found: /${commandName}`;
    }

    return `
/${command.name}
${command.description}

Usage: ${command.usage}

Examples:
${command.examples.map((ex) => `  ${ex}`).join('\n')}
`;
  }
}

// Initialize parser
export const parser = new SlashCommandParser();

// Register commands
export const searchCommand: SlashCommand = {
  name: 'search',
  description: 'Search across all sessions (FTS5 + vector)',
  usage: '/search "<query>" [--mode fts|vector|hybrid] [--top-k N] [--agent AGENT]',
  examples: [
    '/search "find mentions of Ethan"',
    '/search "trading signals" --mode hybrid --top-k 5',
    '/search "customer feedback" --agent legatus',
  ],
  handler: async (args: string[]) => {
    const query = args[0]?.replace(/^["']|["']$/g, '') || '';
    const topK = parseInt(args.find((a) => a.startsWith('--top-k'))?.split(' ')[1] || '10');
    const mode = (args.find((a) => a.startsWith('--mode'))?.split(' ')[1] as any) || 'hybrid';
    const agent = args.find((a) => a.startsWith('--agent'))?.split(' ')[1];

    if (!query) {
      return '❌ Query is required: /search "<query>"';
    }

    const results = await searchEngine.search(query, { mode, topK, agent });

    if (results.length === 0) {
      return `📭 No results found for: "${query}"`;
    }

    let output = `🔍 Found ${results.length} results:\n\n`;
    for (const [i, result] of results.entries()) {
      output += `${i + 1}. **${result.sessionKey}** (${result.agent})\n`;
      output += `   Score: ${result.score.toFixed(3)} | Type: ${result.searchType}\n`;
      output += `   ${result.summary.substring(0, 100)}...\n\n`;
    }

    return output;
  },
};

export const executeCommand: SlashCommand = {
  name: 'execute',
  description: 'Execute code safely via ClawCode',
  usage: '/execute "<code>" [--model opus|sonnet|haiku] [--tools TOOL1,TOOL2]',
  examples: [
    '/execute "print(\'hello world\')"',
    '/execute "import os; print(os.getcwd())" --model sonnet --tools run_command',
  ],
  handler: async (args: string[]) => {
    const code = args[0]?.replace(/^["']|["']$/g, '') || '';

    if (!code) {
      return '❌ Code is required: /execute "<code>"';
    }

    // Would call claw executor here
    return `✅ Would execute:\n\`\`\`\n${code}\n\`\`\`\n\n(Actual execution requires claw-code integration)`;
  },
};

export const buildCommand: SlashCommand = {
  name: 'build',
  description: 'Build a new feature or component',
  usage: '/build "<description>" [--model opus|sonnet]',
  examples: [
    '/build "Create a REST API for user management"',
    '/build "Build a React component for data table" --model opus',
  ],
  handler: async (args: string[]) => {
    const description = args[0]?.replace(/^["']|["']$/g, '') || '';

    if (!description) {
      return '❌ Description is required: /build "<description>"';
    }

    return `🔨 Building:\n${description}\n\n(Execution requires claude-code integration)`;
  },
};

export const auditCommand: SlashCommand = {
  name: 'audit',
  description: 'Audit code for security + quality issues',
  usage: '/audit "<code or file>" [--strict]',
  examples: [
    '/audit "const x = eval(userInput)"',
    '/audit "packages/runtime/src/index.ts" --strict',
  ],
  handler: async (args: string[]) => {
    const target = args[0]?.replace(/^["']|["']$/g, '') || '';

    if (!target) {
      return '❌ Code or file is required: /audit "<code>"';
    }

    return `🔍 Auditing:\n${target}\n\n(Execution requires ClawCode integration)`;
  },
};

export const helpCommand: SlashCommand = {
  name: 'help',
  description: 'Show help for commands',
  usage: '/help [command]',
  examples: [
    '/help',
    '/help search',
    '/help execute',
  ],
  handler: async (args: string[]) => {
    const cmdName = args[0];

    if (cmdName) {
      return parser.getHelp(cmdName);
    }

    return `
📚 Operaxon Slash Commands

${parser.listCommands()}

Get help for a command: /help <command>
`;
  },
};

// Register all commands
parser.register(searchCommand);
parser.register(executeCommand);
parser.register(buildCommand);
parser.register(auditCommand);
parser.register(helpCommand);
