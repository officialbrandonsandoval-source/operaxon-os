// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

import { randomUUID } from 'node:crypto';

export interface Session {
  id: string;
  agentId: string;
  principalId: string;
  channelId: string;
  createdAt: string;
  lastActive: string;
  metadata: Record<string, string>;
  messages: SessionMessage[];
}

export interface SessionMessage {
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: string;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private readonly maxIdleMs: number;

  constructor(maxIdleMs: number = 3600000) { // 1 hour default
    this.maxIdleMs = maxIdleMs;
  }

  create(agentId: string, principalId: string, channelId: string): Session {
    const now = new Date().toISOString();
    const session: Session = {
      id: randomUUID(),
      agentId,
      principalId,
      channelId,
      createdAt: now,
      lastActive: now,
      metadata: {},
      messages: [],
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  addMessage(sessionId: string, message: SessionMessage): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.messages.push(message);
    session.lastActive = new Date().toISOString();
  }

  getActiveSessions(): Session[] {
    const cutoff = Date.now() - this.maxIdleMs;
    return Array.from(this.sessions.values()).filter(
      s => new Date(s.lastActive).getTime() > cutoff
    );
  }

  close(sessionId: string): Session | undefined {
    const session = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);
    return session;
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  cleanup(): number {
    const cutoff = Date.now() - this.maxIdleMs;
    let cleaned = 0;
    for (const [id, session] of this.sessions) {
      if (new Date(session.lastActive).getTime() <= cutoff) {
        this.sessions.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }
}
