#!/usr/bin/env ts-node
/**
 * operaxon init
 * Scaffold a new Operaxon OS agent project in the current directory.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const AGENT_TYPES = ['builder', 'researcher', 'communicator', 'sales', 'custom'];

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main(): Promise<void> {
  console.log('\n🔷 Operaxon OS — Project Initializer\n');

  const targetDir = process.argv[2] || '.';
  const absDir = path.resolve(targetDir);

  if (targetDir !== '.') {
    fs.mkdirSync(absDir, { recursive: true });
  }

  const name = await prompt('Agent name (my-agent): ') || 'my-agent';
  const typeInput = await prompt(`Agent type [${AGENT_TYPES.join('/')}] (builder): `) || 'builder';
  const type = AGENT_TYPES.includes(typeInput) ? typeInput : 'builder';
  const port = await prompt('Port (3000): ') || '3000';

  // Write .env
  const envContent = [
    `PORT=${port}`,
    `NODE_ENV=development`,
    `AGENT_NAME=${name}`,
    `AGENT_ID=`,
    `ANTHROPIC_API_KEY=`,
    `TELEGRAM_BOT_TOKEN=`,
    `DISCORD_BOT_TOKEN=`,
    `SESSION_SECRET=${Math.random().toString(36).slice(2)}`,
    `LOG_LEVEL=info`,
  ].join('\n');

  fs.writeFileSync(path.join(absDir, '.env'), envContent);

  // Write operaxon.config.json
  const config = {
    name,
    type,
    version: '0.1.0',
    port: parseInt(port),
    channels: { http: true },
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(absDir, 'operaxon.config.json'),
    JSON.stringify(config, null, 2)
  );

  // Write agent entry point
  const agentFile = `import { createGateway } from 'operaxon-os';
import ${capitalize(type)}Agent from 'operaxon-os/agents/templates/${type}';

async function main() {
  const gateway = createGateway({ port: ${port} });
  const agent = new ${capitalize(type)}Agent({ name: '${name}' });

  await gateway.listen(${port});

  console.log('Agent "${name}" is running.');
  console.log('Send messages to http://localhost:${port}/agent/message');
}

main().catch(console.error);
`;

  fs.writeFileSync(path.join(absDir, 'agent.ts'), agentFile);

  // Write README
  fs.writeFileSync(
    path.join(absDir, 'README.md'),
    `# ${name}\n\nBuilt with [Operaxon OS](https://github.com/officialbrandonsandoval-source/operaxon-os).\n\n## Start\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n`
  );

  console.log('\n✅ Project initialized!\n');
  console.log(`  📁 ${absDir}`);
  console.log(`  🤖 Agent: ${name} (${type})`);
  console.log(`  🌐 Port: ${port}`);
  console.log('\nNext steps:');
  console.log('  1. Edit .env with your API keys');
  console.log('  2. npm install');
  console.log('  3. operaxon start\n');

  process.exit(0);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

main().catch((err) => {
  console.error('Init failed:', err.message);
  process.exit(1);
});
