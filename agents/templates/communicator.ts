/**
 * Communicator Agent Template
 *
 * A communications agent that manages outbound messaging,
 * notifications, and multi-channel distribution.
 */

import type { AgentMessage } from '../../packages/runtime/types';

export interface CommunicatorAgentConfig {
  name: string;
  defaultChannel?: string;
  signature?: string;
  rateLimit?: {
    maxPerHour: number;
    maxPerDay: number;
  };
}

export interface OutboundMessage {
  id: string;
  to: string;
  channel: string;
  content: string;
  status: 'queued' | 'sent' | 'failed';
  scheduledAt?: Date;
  sentAt?: Date;
}

export class CommunicatorAgent {
  private outbox: OutboundMessage[] = [];
  private sentCount = { hour: 0, day: 0 };

  constructor(private config: CommunicatorAgentConfig) {
    console.log(`[Communicator] Agent "${config.name}" initialized`);
  }

  async processMessage(message: AgentMessage): Promise<string> {
    const content = message.content.toLowerCase();

    if (content.includes('send') || content.includes('notify') ||
        content.includes('message') || content.includes('broadcast')) {
      return this.handleSendRequest(message.content);
    }

    if (content.includes('status') || content.includes('outbox')) {
      return this.getStatus();
    }

    if (content.includes('help')) {
      return this.getHelp();
    }

    return `Communicator agent "${this.config.name}" received: "${message.content}". Send "help" for available commands.`;
  }

  private async handleSendRequest(request: string): Promise<string> {
    const msg: OutboundMessage = {
      id: `msg-${Date.now()}`,
      to: 'unknown',
      channel: this.config.defaultChannel || 'telegram',
      content: request,
      status: 'queued',
    };

    this.outbox.push(msg);

    return [
      `📤 Message queued: ${msg.id}`,
      `Channel: ${msg.channel}`,
      `Content: ${request.substring(0, 80)}...`,
      ``,
      `To activate: connect to real channel adapters (Telegram, Discord, etc.)`,
      `and implement routing logic.`,
    ].join('\n');
  }

  private getStatus(): string {
    return [
      `📊 Communicator Status`,
      `Agent: ${this.config.name}`,
      `Outbox: ${this.outbox.length} messages`,
      `Sent (hour): ${this.sentCount.hour}`,
      `Sent (day): ${this.sentCount.day}`,
      `Default channel: ${this.config.defaultChannel || 'telegram'}`,
      `Rate limit: ${this.config.rateLimit?.maxPerHour || '∞'}/hr`,
    ].join('\n');
  }

  private getHelp(): string {
    return [
      `📡 Communicator Agent — Available Commands`,
      ``,
      `send/notify <message> — Queue an outbound message`,
      `status — Show agent status`,
      `help — Show this message`,
      ``,
      `Examples:`,
      `  "Send daily report to #agent-reports"`,
      `  "Notify team that deployment is complete"`,
      `  "Broadcast market alert to all subscribers"`,
    ].join('\n');
  }
}

export default CommunicatorAgent;
