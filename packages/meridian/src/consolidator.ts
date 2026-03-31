// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * Consolidator — high-level task API for MERIDIAN.
 *
 * Reads daily logs, session transcripts, and agent outputs.
 * Wraps the lower-level MeridianEngine with a simpler interface for agents.
 *
 * Usage:
 *   const consolidator = new Consolidator({ storagePath, encryptionKeyRef });
 *   await consolidator.initialize();
 *   await consolidator.logAction('wrote new feature', { agentId: 'agt-001' });
 *   const result = await consolidator.runIfReady();
 */

import { mkdir, appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AuditLog } from '@operaxon/security';
import { MeridianEngine } from './engine.js';
import type { ConsolidationResult } from './engine.js';
import type { MeridianConfig } from '@operaxon/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConsolidatorOptions {
  storagePath: string;
  encryptionKeyRef: string;
  timeGateHours?: number;
  sessionGateCount?: number;
  maxMemoryLines?: number;
  maxMemoryBytes?: number;
  auditSigningKey?: Buffer;
}

export interface LogActionOptions {
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionTranscript {
  sessionId: string;
  agentId: string;
  startedAt: string;
  messages: TranscriptMessage[];
}

export interface TranscriptMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Consolidator
// ---------------------------------------------------------------------------

export class Consolidator {
  private readonly storagePath: string;
  private readonly logsDir: string;
  private readonly transcriptsDir: string;
  private readonly memoryDir: string;
  private engine: MeridianEngine | null = null;
  private readonly options: ConsolidatorOptions;
  private initialized = false;

  constructor(options: ConsolidatorOptions) {
    this.options = options;
    this.storagePath = options.storagePath;
    this.logsDir = join(options.storagePath, 'daily-logs');
    this.transcriptsDir = join(options.storagePath, 'transcripts');
    this.memoryDir = join(options.storagePath, 'memory');
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async initialize(): Promise<void> {
    // Ensure all directories exist
    await Promise.all([
      mkdir(this.logsDir, { recursive: true }),
      mkdir(this.transcriptsDir, { recursive: true }),
      mkdir(this.memoryDir, { recursive: true }),
      mkdir(join(this.storagePath, 'memories'), { recursive: true }),
    ]);

    // Build MeridianConfig from options
    const meridianConfig: MeridianConfig = {
      storagePath: this.storagePath,
      encryptionKeyRef: this.options.encryptionKeyRef,
      timeGateHours: this.options.timeGateHours ?? 24,
      sessionGateCount: this.options.sessionGateCount ?? 5,
      maxMemoryLines: this.options.maxMemoryLines ?? 200,
      maxMemoryBytes: this.options.maxMemoryBytes ?? 50 * 1024,
    };

    const signingKey = this.options.auditSigningKey ?? Buffer.alloc(32, 'dev-key');
    const audit = new AuditLog(this.storagePath, signingKey);

    this.engine = new MeridianEngine({
      config: meridianConfig,
      audit,
      holderId: `consolidator-${process.pid}`,
    });

    this.initialized = true;
  }

  // -----------------------------------------------------------------------
  // Logging API — agents call these during their work
  // -----------------------------------------------------------------------

  /**
   * Log a single action to today's daily log.
   * Agents call this after completing each meaningful action.
   */
  async logAction(action: string, options: LogActionOptions = {}): Promise<void> {
    this.assertInitialized();

    const today = todayString();
    const logPath = join(this.logsDir, `${today}.log`);
    const agentId = options.agentId ?? 'unknown';

    const entry = [
      `[${new Date().toISOString()}] [${agentId}] ${action}`,
      options.metadata ? `  metadata: ${JSON.stringify(options.metadata)}` : null,
      '',
    ]
      .filter(l => l !== null)
      .join('\n');

    await appendFile(logPath, entry, 'utf8');
  }

  /**
   * Save a complete session transcript for future consolidation.
   * Call at the end of an agent session.
   */
  async saveTranscript(transcript: SessionTranscript): Promise<void> {
    this.assertInitialized();

    const filename = `${transcript.sessionId}.transcript`;
    const filePath = join(this.transcriptsDir, filename);

    // Format as human-readable with structured markers
    const lines: string[] = [
      `# Session: ${transcript.sessionId}`,
      `Agent: ${transcript.agentId}`,
      `Started: ${transcript.startedAt}`,
      `Saved: ${new Date().toISOString()}`,
      '',
    ];

    for (const msg of transcript.messages) {
      const speaker = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
      lines.push(`${speaker}: ${msg.content}`);
      lines.push('');
    }

    await writeFile(filePath, lines.join('\n'), 'utf8');
  }

  /**
   * Write a lesson to today's memory file (memory/YYYY-MM-DD.md).
   * Synthesizer calls this; agents can also call it directly with key insights.
   */
  async writeDailyLesson(lesson: string, agentId: string = 'meridian'): Promise<void> {
    this.assertInitialized();

    const today = todayString();
    const memPath = join(this.memoryDir, `${today}.md`);

    // Read existing content or create header
    let existing = '';
    try {
      existing = await readFile(memPath, 'utf8');
    } catch {
      existing = `# Memory — ${today}\n\n`;
    }

    const entry = `## [${new Date().toISOString().slice(11, 19)} UTC] (${agentId})\n\n${lesson}\n\n`;

    // Enforce 200-line limit by pruning from the top if needed
    const updated = pruneToLineLimit(existing + entry, 200);
    await writeFile(memPath, updated, 'utf8');
  }

  /**
   * Increment the session counter (call at the start of each new agent session).
   * Used by the session gate to track whether consolidation should run.
   */
  async incrementSessionCount(): Promise<void> {
    this.assertInitialized();
    const store = this.engine!.memoryStore;
    const state = await store.readState();
    await store.writeState({
      ...state,
      sessionsSinceLastConsolidation: state.sessionsSinceLastConsolidation + 1,
    });
  }

  // -----------------------------------------------------------------------
  // Consolidation
  // -----------------------------------------------------------------------

  /**
   * Run consolidation if all three gates pass (time + session + lock).
   * Returns the result, or null if gates didn't pass.
   */
  async runIfReady(): Promise<ConsolidationResult | null> {
    this.assertInitialized();
    return this.engine!.dreamIfReady();
  }

  /**
   * Force-run consolidation regardless of gate status.
   * Use for testing or manual triggers.
   */
  async runNow(): Promise<ConsolidationResult> {
    this.assertInitialized();
    return this.engine!.consolidate();
  }

  /**
   * Check gate status without running consolidation.
   */
  async shouldConsolidate(): Promise<boolean> {
    this.assertInitialized();
    const result = await this.engine!.shouldConsolidate();
    return result.allPassed;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private assertInitialized(): void {
    if (!this.initialized || this.engine === null) {
      throw new Error('Consolidator not initialized — call initialize() first');
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayString(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function pruneToLineLimit(content: string, maxLines: number): string {
  const lines = content.split('\n');
  if (lines.length <= maxLines) return content;

  // Find the first heading after the title to preserve structure
  // Remove oldest entries from the middle (after the header)
  const headerEnd = lines.findIndex((l, i) => i > 0 && l.startsWith('## '));
  if (headerEnd === -1) {
    // No structure found — just trim from top
    return lines.slice(lines.length - maxLines).join('\n');
  }

  const header = lines.slice(0, headerEnd);
  const body = lines.slice(headerEnd);
  const targetBodyLines = maxLines - header.length;

  // Keep the most recent entries (from the end)
  const prunedBody = body.slice(body.length - targetBodyLines);
  return [...header, ...prunedBody].join('\n');
}
