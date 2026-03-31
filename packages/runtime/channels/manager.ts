import type { AgentMessage, ChannelConfig } from '../types';
import { v4 as uuidv4 } from 'uuid';

export type MessageHandler = (message: AgentMessage) => Promise<void>;

export interface Channel {
  name: string;
  send(to: string, content: string): Promise<void>;
  onMessage(handler: MessageHandler): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

/**
 * Telegram channel stub
 * Implement with node-telegram-bot-api or grammy
 */
export class TelegramChannel implements Channel {
  name = 'telegram';
  private handler?: MessageHandler;

  constructor(private botToken: string) {}

  async connect(): Promise<void> {
    console.log('[Telegram] Channel connecting...');
    // TODO: initialize Telegram bot
    console.log('[Telegram] Channel ready (stub)');
  }

  async disconnect(): Promise<void> {
    console.log('[Telegram] Channel disconnected');
  }

  async send(to: string, content: string): Promise<void> {
    console.log(`[Telegram] → ${to}: ${content.substring(0, 80)}...`);
    // TODO: bot.sendMessage(to, content)
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler;
    // TODO: bot.on('message', ...) → call handler
  }

  // Internal: simulate receiving a message (for testing)
  async simulateInbound(from: string, content: string): Promise<void> {
    if (this.handler) {
      await this.handler({
        id: uuidv4(),
        sessionId: uuidv4(),
        channel: this.name,
        role: 'user',
        content,
        timestamp: new Date(),
        metadata: { from },
      });
    }
  }
}

/**
 * Discord channel stub
 * Implement with discord.js
 */
export class DiscordChannel implements Channel {
  name = 'discord';
  private handler?: MessageHandler;

  constructor(private botToken: string) {}

  async connect(): Promise<void> {
    console.log('[Discord] Channel connecting...');
    // TODO: initialize Discord client
    console.log('[Discord] Channel ready (stub)');
  }

  async disconnect(): Promise<void> {
    console.log('[Discord] Channel disconnected');
  }

  async send(to: string, content: string): Promise<void> {
    console.log(`[Discord] → ${to}: ${content.substring(0, 80)}...`);
    // TODO: channel.send(content)
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler;
    // TODO: client.on('messageCreate', ...) → call handler
  }
}

/**
 * HTTP channel — messages via REST API
 */
export class HTTPChannel implements Channel {
  name = 'http';
  private handler?: MessageHandler;

  async connect(): Promise<void> {
    console.log('[HTTP] Channel ready');
  }

  async disconnect(): Promise<void> {}

  async send(_to: string, content: string): Promise<void> {
    console.log(`[HTTP] Response: ${content.substring(0, 80)}...`);
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler;
  }

  async receive(from: string, content: string, sessionId?: string): Promise<void> {
    if (this.handler) {
      await this.handler({
        id: uuidv4(),
        sessionId: sessionId || uuidv4(),
        channel: this.name,
        role: 'user',
        content,
        timestamp: new Date(),
        metadata: { from },
      });
    }
  }
}

/**
 * ChannelManager — manages all active channels
 */
export class ChannelManager {
  private channels: Map<string, Channel> = new Map();

  constructor(private config: ChannelConfig = {}) {}

  async init(): Promise<void> {
    // Always add HTTP channel
    const http = new HTTPChannel();
    await http.connect();
    this.channels.set('http', http);

    if (this.config.telegram?.botToken) {
      const telegram = new TelegramChannel(this.config.telegram.botToken);
      await telegram.connect();
      this.channels.set('telegram', telegram);
    }

    if (this.config.discord?.botToken) {
      const discord = new DiscordChannel(this.config.discord.botToken);
      await discord.connect();
      this.channels.set('discord', discord);
    }

    console.log(`[ChannelManager] Active channels: ${[...this.channels.keys()].join(', ')}`);
  }

  get(name: string): Channel | undefined {
    return this.channels.get(name);
  }

  getAll(): Channel[] {
    return [...this.channels.values()];
  }

  onMessage(handler: MessageHandler): void {
    this.channels.forEach((channel) => channel.onMessage(handler));
  }

  async broadcast(content: string): Promise<void> {
    await Promise.all(
      [...this.channels.entries()].map(([name, ch]) =>
        ch.send(name, content).catch((err) =>
          console.error(`[ChannelManager] Error broadcasting to ${name}:`, err)
        )
      )
    );
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this.channels.values()].map((ch) => ch.disconnect()));
    this.channels.clear();
  }
}
