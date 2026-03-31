#!/usr/bin/env ts-node
/**
 * operaxon start
 * Start the Operaxon OS gateway server.
 */

import * as path from 'path';
import * as fs from 'fs';

// Load .env
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  lines.forEach((line) => {
    const [key, ...rest] = line.split('=');
    if (key && !key.startsWith('#') && rest.length) {
      process.env[key.trim()] = rest.join('=').trim();
    }
  });
}

import { createGateway } from '../packages/runtime';
import { ChannelManager } from '../packages/runtime/channels/manager';
import { SessionManager } from '../packages/runtime/sessions/manager';
import { CronScheduler } from '../packages/runtime/cron/scheduler';

const PORT = parseInt(process.env.PORT || '3000');
const AGENT_NAME = process.env.AGENT_NAME || 'operaxon-agent';
const AGENT_ID = process.env.AGENT_ID || `agent-${Date.now()}`;

async function start(): Promise<void> {
  console.log(`
  ┌─────────────────────────────────┐
  │        Operaxon OS v0.1.0       │
  │   The Agentic Business OS       │
  └─────────────────────────────────┘
  `);

  // Initialize core services
  const gateway = createGateway();
  const sessions = new SessionManager(AGENT_ID);
  const channels = new ChannelManager({
    telegram: process.env.TELEGRAM_BOT_TOKEN
      ? { botToken: process.env.TELEGRAM_BOT_TOKEN }
      : undefined,
    discord: process.env.DISCORD_BOT_TOKEN
      ? { botToken: process.env.DISCORD_BOT_TOKEN }
      : undefined,
  });
  const scheduler = new CronScheduler();

  // Init channels
  await channels.init();

  // Register example cron job
  scheduler.register(
    'heartbeat',
    'Agent Heartbeat',
    '*/5 * * * *', // every 5 minutes
    () => {
      const stats = sessions.stats();
      console.log(`[Heartbeat] Agent: ${AGENT_NAME} | Sessions: ${stats.total}`);
    }
  );

  // Handle inbound messages from all channels
  channels.onMessage(async (message) => {
    const session = sessions.getOrCreate(message.sessionId, message.channel);
    sessions.addMessage(session.id, {
      channel: message.channel,
      role: 'user',
      content: message.content,
      timestamp: message.timestamp,
    });
    console.log(`[Message] [${message.channel}] ${message.content.substring(0, 80)}`);
  });

  // Start gateway
  await gateway.listen(PORT);

  console.log(`\n  Agent: ${AGENT_NAME} (${AGENT_ID})`);
  console.log(`  Sessions: ${sessions.stats().total} active`);
  console.log(`  Cron jobs: ${scheduler.list().length} registered`);
  console.log(`\n  Press Ctrl+C to stop.\n`);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[${signal}] Shutting down gracefully...`);
    scheduler.shutdown();
    await channels.shutdown();
    await gateway.close();
    sessions.shutdown();
    console.log('Goodbye.\n');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  console.error('Failed to start Operaxon OS:', err.message);
  process.exit(1);
});
