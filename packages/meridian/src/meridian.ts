// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * MERIDIAN — the unified memory API that agents use.
 *
 * This is the agent-facing interface. Simple, high-level, direct.
 *
 * @example
 * const meridian = new Meridian({ storagePath: './data/memory', encryptionKeyRef: 'my-key' });
 * await meridian.initialize();
 *
 * // Log actions
 * await meridian.log('deployed new feature', { agentId: 'agt-001' });
 *
 * // Search memory
 * const results = await meridian.search('what have we learned about deployment?');
 *
 * // Extract and store lessons from a session
 * await meridian.processSession(transcript, 'session-123', 'agt-001');
 *
 * // Run consolidation if ready
 * await meridian.consolidateIfReady();
 */

import { Consolidator } from './consolidator.js';
import { Synthesizer } from './synthesizer.js';
import { MeridianStorage } from './storage.js';
import type { ConsolidatorOptions, SessionTranscript } from './consolidator.js';
import type { MemorySnippet } from './storage.js';
import type { SynthesisResult } from './synthesizer.js';
import type { ConsolidationResult } from './engine.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface MeridianOptions extends ConsolidatorOptions {
  /** Max lessons per session (default 2) */
  maxLessonsPerSession?: number;
}

// ---------------------------------------------------------------------------
// Meridian — the one class agents use
// ---------------------------------------------------------------------------

export class Meridian {
  private readonly consolidator: Consolidator;
  private readonly synthesizer: Synthesizer;
  private readonly storage: MeridianStorage;
  private initialized = false;

  constructor(options: MeridianOptions) {
    this.consolidator = new Consolidator(options);
    this.synthesizer = new Synthesizer({
      maxLessonsPerSession: options.maxLessonsPerSession ?? 2,
      storagePath: options.storagePath,
    });
    this.storage = new MeridianStorage({
      basePath: options.storagePath,
    });
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async initialize(): Promise<void> {
    await Promise.all([
      this.consolidator.initialize(),
      this.storage.initialize(),
    ]);
    this.initialized = true;
  }

  // -----------------------------------------------------------------------
  // Core agent API
  // -----------------------------------------------------------------------

  /**
   * Log an action to today's daily log.
   * Call after every meaningful agent action.
   */
  async log(action: string, options: { agentId?: string; metadata?: Record<string, unknown> } = {}): Promise<void> {
    this.assertInitialized();
    await this.consolidator.logAction(action, options);
  }

  /**
   * Search memory for relevant snippets.
   * Simple keyword search for Phase 2 — upgradeable to vector embeddings.
   *
   * @returns Array of memory snippets ranked by relevance
   */
  async search(query: string, topK: number = 5): Promise<MemorySnippet[]> {
    this.assertInitialized();
    return this.storage.search(query, topK);
  }

  /**
   * Process a session transcript: extract lessons and write to daily memory.
   * Call at the end of an agent session.
   */
  async processSession(
    transcript: SessionTranscript,
    sessionId?: string,
    agentId?: string,
  ): Promise<SynthesisResult> {
    this.assertInitialized();

    const sid = sessionId ?? transcript.sessionId;
    const aid = agentId ?? transcript.agentId;

    // Build full text from the transcript
    const content = transcript.messages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    // Extract lessons
    const result = this.synthesizer.extractFromSession(content, sid, aid);

    // Save the transcript for future consolidation
    await this.consolidator.saveTranscript(transcript);

    // Write lessons to daily memory
    if (result.lessons.length > 0) {
      const markdown = this.synthesizer.formatAsMarkdown(result);
      await this.consolidator.writeDailyLesson(markdown, aid);
    }

    // Increment session count for gate tracking
    await this.consolidator.incrementSessionCount();

    return result;
  }

  /**
   * Write a lesson directly to today's memory file.
   * Use for important observations that don't need synthesis.
   */
  async writeLesson(lesson: string, agentId?: string): Promise<void> {
    this.assertInitialized();
    await this.consolidator.writeDailyLesson(lesson, agentId);
  }

  /**
   * Run memory consolidation if all three gates pass.
   * Schedule this via cron — typically daily or every 5 sessions.
   */
  async consolidateIfReady(): Promise<ConsolidationResult | null> {
    this.assertInitialized();
    return this.consolidator.runIfReady();
  }

  /**
   * Force-run consolidation regardless of gate status.
   * For testing or manual triggers.
   */
  async consolidateNow(): Promise<ConsolidationResult> {
    this.assertInitialized();
    return this.consolidator.runNow();
  }

  /**
   * Check if consolidation should run (all three gates pass).
   */
  async shouldConsolidate(): Promise<boolean> {
    this.assertInitialized();
    return this.consolidator.shouldConsolidate();
  }

  /**
   * Get recent patterns from memory (last N days).
   */
  async getRecentPatterns(lookbackDays: number = 7): Promise<string[]> {
    this.assertInitialized();
    return this.synthesizer.getRecentPatterns(lookbackDays);
  }

  // -----------------------------------------------------------------------
  // Storage access (for advanced use)
  // -----------------------------------------------------------------------

  get store(): MeridianStorage {
    return this.storage;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('Meridian not initialized — call initialize() first');
    }
  }
}
