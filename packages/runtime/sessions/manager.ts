import { v4 as uuidv4 } from 'uuid';
import type { AgentSession, AgentMessage, SessionConfig } from '../types';

export class SessionManager {
  private sessions: Map<string, AgentSession> = new Map();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    private agentId: string,
    private config: SessionConfig = { secret: 'change-me', ttlSeconds: 3600 }
  ) {
    // Periodically clean expired sessions
    this.cleanupInterval = setInterval(
      () => this.cleanup(),
      60_000 // every minute
    );
  }

  create(channel: string, userId?: string, metadata?: Record<string, unknown>): AgentSession {
    const session: AgentSession = {
      id: uuidv4(),
      agentId: this.agentId,
      userId,
      channel,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata,
    };

    this.sessions.set(session.id, session);
    console.log(`[Sessions] Created session ${session.id} on ${channel}`);
    return session;
  }

  get(id: string): AgentSession | undefined {
    return this.sessions.get(id);
  }

  getOrCreate(
    id: string | undefined,
    channel: string,
    userId?: string
  ): AgentSession {
    if (id) {
      const existing = this.sessions.get(id);
      if (existing) {
        return existing;
      }
    }
    return this.create(channel, userId);
  }

  addMessage(sessionId: string, message: Omit<AgentMessage, 'id' | 'sessionId'>): AgentMessage {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const fullMessage: AgentMessage = {
      ...message,
      id: uuidv4(),
      sessionId,
    };

    session.messages.push(fullMessage);
    session.updatedAt = new Date();
    return fullMessage;
  }

  getHistory(sessionId: string, limit?: number): AgentMessage[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const msgs = session.messages;
    return limit ? msgs.slice(-limit) : msgs;
  }

  delete(id: string): boolean {
    const existed = this.sessions.has(id);
    this.sessions.delete(id);
    if (existed) console.log(`[Sessions] Deleted session ${id}`);
    return existed;
  }

  list(): AgentSession[] {
    return [...this.sessions.values()];
  }

  stats(): { total: number; byChannel: Record<string, number> } {
    const byChannel: Record<string, number> = {};
    this.sessions.forEach((s) => {
      byChannel[s.channel] = (byChannel[s.channel] || 0) + 1;
    });
    return { total: this.sessions.size, byChannel };
  }

  private cleanup(): void {
    const now = Date.now();
    const ttlMs = this.config.ttlSeconds * 1000;
    let removed = 0;

    this.sessions.forEach((session, id) => {
      if (now - session.updatedAt.getTime() > ttlMs) {
        this.sessions.delete(id);
        removed++;
      }
    });

    if (removed > 0) {
      console.log(`[Sessions] Cleaned up ${removed} expired sessions`);
    }
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.sessions.clear();
  }
}
