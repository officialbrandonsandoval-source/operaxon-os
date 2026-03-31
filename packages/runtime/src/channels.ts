// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

import type { ChannelConfig, ChannelType } from '@operaxon/types';

export abstract class ChannelAdapter {
  protected readonly config: ChannelConfig;

  constructor(config: ChannelConfig) {
    this.config = config;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract send(recipient: string, message: ChannelMessage): Promise<void>;
  abstract onMessage(handler: MessageHandler): void;
}

export interface ChannelMessage {
  text: string;
  metadata?: Record<string, string>;
}

export type MessageHandler = (message: InboundMessage) => Promise<void>;

export interface InboundMessage {
  channelType: ChannelType;
  sender: string;
  text: string;
  timestamp: string;
  raw: unknown;
}

export class TelegramAdapter extends ChannelAdapter {
  protected handler: MessageHandler | null = null;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  async connect(): Promise<void> {
    // Credentials are referenced from keychain, never stored in memory long-term
    // Polling mode for simplicity in v0.1
  }

  async disconnect(): Promise<void> {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  async send(_recipient: string, _message: ChannelMessage): Promise<void> {
    // Will use Bot API via fetch — credentials from keychain reference
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler;
  }
}

export class DiscordAdapter extends ChannelAdapter {
  protected handler: MessageHandler | null = null;

  async connect(): Promise<void> {
    // Discord bot connection via WebSocket gateway
  }

  async disconnect(): Promise<void> {
    // Clean disconnect
  }

  async send(_recipient: string, _message: ChannelMessage): Promise<void> {
    // Stub — will use Discord API
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler;
  }
}

export class WebhookAdapter extends ChannelAdapter {
  protected handler: MessageHandler | null = null;

  async connect(): Promise<void> {
    // Register webhook endpoint
  }

  async disconnect(): Promise<void> {
    // Deregister
  }

  async send(_recipient: string, _message: ChannelMessage): Promise<void> {
    // Stub — will use HTTP POST
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler;
  }
}

export class ChannelRegistry {
  private adapters: Map<string, ChannelAdapter> = new Map();

  register(config: ChannelConfig): ChannelAdapter {
    let adapter: ChannelAdapter;
    switch (config.type) {
      case 'telegram':
        adapter = new TelegramAdapter(config);
        break;
      case 'discord':
        adapter = new DiscordAdapter(config);
        break;
      case 'webhook':
        adapter = new WebhookAdapter(config);
        break;
      default:
        adapter = new WebhookAdapter(config); // fallback
    }
    this.adapters.set(config.id, adapter);
    return adapter;
  }

  get(channelId: string): ChannelAdapter | undefined {
    return this.adapters.get(channelId);
  }

  async connectAll(): Promise<void> {
    const connections = Array.from(this.adapters.values()).map(a => a.connect());
    await Promise.all(connections);
  }

  async disconnectAll(): Promise<void> {
    const disconnections = Array.from(this.adapters.values()).map(a => a.disconnect());
    await Promise.all(disconnections);
  }
}
