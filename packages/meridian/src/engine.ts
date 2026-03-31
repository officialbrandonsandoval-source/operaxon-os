// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

import type {
  MeridianConfig,
  MeridianState,
  MeridianPhase,
  MemoryEntry,
  MemoryType,
  ConsolidationSignal,
} from '@operaxon/types';
import { AuditLog } from '@operaxon/security';
import { GateCoordinator, type GateCheckResult } from './gates.js';
import { MemoryStore } from './memory-store.js';
import {
  gatherFromDailyLogs,
  gatherFromDriftedMemories,
  gatherFromTranscripts,
  prioritizeSignals,
  createSignalOptions,
  type SignalGatherOptions,
} from './signal.js';

// ---------------------------------------------------------------------------
// Consolidation result
// ---------------------------------------------------------------------------

export interface ConsolidationResult {
  success: boolean;
  phases: MeridianPhase[];
  startedAt: string;
  completedAt: string;
  memoriesCreated: number;
  memoriesUpdated: number;
  memoriesDeleted: number;
  signalsProcessed: number;
  indexLinesBefore: number;
  indexLinesAfter: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Phase tracking
// ---------------------------------------------------------------------------

function createPhase(name: MeridianPhase['name']): MeridianPhase {
  return { name, status: 'pending' };
}

function startPhase(phase: MeridianPhase): MeridianPhase {
  return { ...phase, status: 'running', startedAt: new Date().toISOString() };
}

function completePhase(phase: MeridianPhase): MeridianPhase {
  return { ...phase, status: 'completed', completedAt: new Date().toISOString() };
}

function failPhase(phase: MeridianPhase, error: string): MeridianPhase {
  return { ...phase, status: 'failed', completedAt: new Date().toISOString(), error };
}

// ---------------------------------------------------------------------------
// Index generation
// ---------------------------------------------------------------------------

interface IndexSection {
  heading: string;
  entries: IndexEntry[];
}

interface IndexEntry {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
}

function generateMemoryIndex(memories: MemoryEntry[], maxLines: number): string {
  // Group memories by type
  const groups = new Map<MemoryType, MemoryEntry[]>();

  for (const mem of memories) {
    const existing = groups.get(mem.type);
    if (existing !== undefined) {
      existing.push(mem);
    } else {
      groups.set(mem.type, [mem]);
    }
  }

  const TYPE_LABELS: Record<MemoryType, string> = {
    user: 'User Preferences',
    feedback: 'Feedback & Corrections',
    project: 'Projects',
    reference: 'Reference Material',
    business: 'Business Context',
    decision: 'Decisions',
    person: 'People',
  };

  const sections: IndexSection[] = [];
  const typeOrder: MemoryType[] = [
    'user', 'person', 'project', 'business', 'decision', 'feedback', 'reference',
  ];

  for (const type of typeOrder) {
    const entries = groups.get(type);
    if (entries === undefined || entries.length === 0) continue;

    // Sort by updatedAt descending
    entries.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    sections.push({
      heading: TYPE_LABELS[type],
      entries: entries.map(e => ({
        id: e.id,
        name: e.name,
        description: e.description,
        updatedAt: e.updatedAt,
      })),
    });
  }

  // Build the index content
  const lines: string[] = [
    '# Memory Index',
    '',
    `> Last consolidated: ${new Date().toISOString()}`,
    `> Total memories: ${memories.length}`,
    '',
  ];

  for (const section of sections) {
    lines.push(`## ${section.heading}`);
    lines.push('');

    for (const entry of section.entries) {
      const dateStr = entry.updatedAt.slice(0, 10); // YYYY-MM-DD
      lines.push(`- **${entry.name}** (${entry.id}) — ${entry.description} [${dateStr}]`);
    }

    lines.push('');
  }

  // Enforce line limit — trim from the bottom (least important sections)
  if (lines.length > maxLines) {
    const trimmed = lines.slice(0, maxLines - 2);
    trimmed.push('');
    trimmed.push(`> [Truncated: ${lines.length - maxLines + 2} lines omitted. Run full index query for details.]`);
    return trimmed.join('\n');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Temporal reference normalization
// ---------------------------------------------------------------------------

/**
 * Converts relative temporal references ("last week", "yesterday") in memory
 * content to absolute dates, anchored to the memory's `updatedAt` timestamp.
 */
function normalizeTemporalReferences(content: string, anchorDate: Date): string {
  let result = content;

  const replacements: Array<{ pattern: RegExp; resolve: (anchor: Date) => string }> = [
    {
      pattern: /\byesterday\b/gi,
      resolve: (d) => formatDate(addDays(d, -1)),
    },
    {
      pattern: /\btoday\b/gi,
      resolve: (d) => formatDate(d),
    },
    {
      pattern: /\btomorrow\b/gi,
      resolve: (d) => formatDate(addDays(d, 1)),
    },
    {
      pattern: /\blast week\b/gi,
      resolve: (d) => `the week of ${formatDate(addDays(d, -7))}`,
    },
    {
      pattern: /\bthis week\b/gi,
      resolve: (d) => `the week of ${formatDate(d)}`,
    },
    {
      pattern: /\blast month\b/gi,
      resolve: (d) => {
        const prev = new Date(d);
        prev.setMonth(prev.getMonth() - 1);
        return formatMonth(prev);
      },
    },
    {
      pattern: /\bthis month\b/gi,
      resolve: (d) => formatMonth(d),
    },
  ];

  for (const { pattern, resolve } of replacements) {
    result = result.replace(pattern, resolve(anchorDate));
  }

  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatMonth(date: Date): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const monthName = months[date.getMonth()];
  return `${monthName ?? 'Unknown'} ${date.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// Contradiction detection
// ---------------------------------------------------------------------------

interface Contradiction {
  existingMemory: MemoryEntry;
  signal: ConsolidationSignal;
  conflictDescription: string;
}

/**
 * Detects contradictions between existing memories and incoming signals.
 * A contradiction occurs when a signal explicitly negates or replaces
 * information in an existing memory.
 */
function detectContradictions(
  memories: MemoryEntry[],
  signals: ConsolidationSignal[],
): Contradiction[] {
  const contradictions: Contradiction[] = [];

  // Only look at high-relevance correction signals
  const corrections = signals.filter(
    s => s.source === 'transcript' && s.relevance >= 0.7,
  );

  for (const signal of corrections) {
    const signalWords = extractKeywords(signal.content);

    for (const memory of memories) {
      const memoryWords = extractKeywords(memory.content);

      // Check for significant keyword overlap (the signal references this memory)
      const overlap = computeKeywordOverlap(signalWords, memoryWords);
      if (overlap < 0.15) continue;

      // Check for negation patterns in the signal that contradict the memory
      if (containsNegationOf(signal.content, memory.content)) {
        contradictions.push({
          existingMemory: memory,
          signal,
          conflictDescription:
            `Signal contradicts memory "${memory.name}": ${signal.content.slice(0, 120)}`,
        });
      }
    }
  }

  return contradictions;
}

function extractKeywords(text: string): Set<string> {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'and', 'but', 'or', 'not', 'no',
    'if', 'then', 'than', 'that', 'this', 'it', 'its', 'i', 'me', 'my',
    'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them', 'their',
  ]);

  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w)),
  );
}

function computeKeywordOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let count = 0;
  for (const word of a) {
    if (b.has(word)) count++;
  }
  return count / Math.min(a.size, b.size);
}

function containsNegationOf(signal: string, memoryContent: string): boolean {
  const negationPatterns = [
    /\b(?:no longer|not|don't|doesn't|isn't|aren't|won't|can't|stopped|quit|left|moved away from)\b/i,
    /\b(?:actually|correction|wrong|incorrect|changed|switched|replaced)\b/i,
  ];

  const signalHasNegation = negationPatterns.some(p => p.test(signal));
  if (!signalHasNegation) return false;

  // Check if the signal references specific content from the memory
  const memoryKeywords = extractKeywords(memoryContent);
  const signalKeywords = extractKeywords(signal);
  const overlap = computeKeywordOverlap(signalKeywords, memoryKeywords);

  return overlap >= 0.2;
}

// ---------------------------------------------------------------------------
// MeridianEngine — the Dream Engine
// ---------------------------------------------------------------------------

export interface MeridianEngineOptions {
  config: MeridianConfig;
  audit: AuditLog;
  holderId?: string;
  signalOptions?: Partial<Omit<SignalGatherOptions, 'storagePath'>>;
}

export class MeridianEngine {
  private readonly config: MeridianConfig;
  private readonly store: MemoryStore;
  private readonly gates: GateCoordinator;
  private readonly audit: AuditLog;
  private readonly signalOptions: SignalGatherOptions;
  private readonly holderId: string;

  constructor(options: MeridianEngineOptions) {
    this.config = options.config;
    this.holderId = options.holderId ?? `meridian-${process.pid}-${Date.now()}`;
    this.store = new MemoryStore({
      storagePath: options.config.storagePath,
      encryptionKeyRef: options.config.encryptionKeyRef,
    });
    this.gates = new GateCoordinator(options.config, this.holderId);
    this.audit = options.audit;
    this.signalOptions = createSignalOptions(
      options.config.storagePath,
      options.signalOptions,
    );
  }

  // -----------------------------------------------------------------------
  // Three-gate check
  // -----------------------------------------------------------------------

  /**
   * Evaluates the three-gate system. ALL gates must pass before consolidation
   * is allowed to run.
   *
   * Gate 1 (Time): At least `timeGateHours` hours since last consolidation.
   * Gate 2 (Session): At least `sessionGateCount` sessions since last consolidation.
   * Gate 3 (Lock): No concurrent consolidation in progress.
   */
  async shouldConsolidate(): Promise<GateCheckResult> {
    const state = await this.store.readState();
    return this.gates.check(state);
  }

  // -----------------------------------------------------------------------
  // Main consolidation pipeline
  // -----------------------------------------------------------------------

  /**
   * Runs the full four-phase consolidation cycle (the "Dream").
   *
   * Phase 1: Orient — read MEMORY.md, scan all topic files
   * Phase 2: Gather — collect signals from daily logs, drifted memories, transcripts
   * Phase 3: Consolidate — write/update memory files, normalize dates, resolve contradictions
   * Phase 4: Prune & Index — regenerate MEMORY.md, enforce line limits, remove stale pointers
   *
   * The entire cycle is wrapped in the dream lock and audited.
   */
  async consolidate(): Promise<ConsolidationResult> {
    const startedAt = new Date().toISOString();
    const errors: string[] = [];
    let memoriesCreated = 0;
    let memoriesUpdated = 0;
    let memoriesDeleted = 0;
    let signalsProcessed = 0;
    let indexLinesBefore = 0;
    let indexLinesAfter = 0;

    // Initialize store (loads encryption key)
    await this.store.initialize();

    // Initialize phases
    let orientPhase = createPhase('orient');
    let gatherPhase = createPhase('gather');
    let consolidatePhase = createPhase('consolidate');
    let prunePhase = createPhase('prune');

    // Audit: consolidation started
    await this.audit.append({
      timestamp: startedAt,
      agent: 'meridian',
      action: 'consolidation.started',
      outcome: 'success',
      metadata: { holderId: this.holderId },
    });

    let existingMemories: MemoryEntry[] = [];
    let existingIndex = '';
    let allSignals: ConsolidationSignal[] = [];

    try {
      // ------------------------------------------------------------------
      // Phase 1: Orient
      // ------------------------------------------------------------------
      orientPhase = startPhase(orientPhase);

      try {
        existingIndex = await this.store.readMemoryIndex();
        indexLinesBefore = existingIndex.length === 0
          ? 0
          : existingIndex.split('\n').length;

        existingMemories = await this.store.listMemoryFiles();

        orientPhase = completePhase(orientPhase);

        await this.audit.append({
          timestamp: new Date().toISOString(),
          agent: 'meridian',
          action: 'consolidation.phase.orient',
          outcome: 'success',
          metadata: {
            memoriesFound: existingMemories.length,
            indexLines: indexLinesBefore,
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        orientPhase = failPhase(orientPhase, msg);
        errors.push(`Orient phase failed: ${msg}`);

        // Orient failure is non-fatal — we can still proceed with empty state
        existingMemories = [];
        existingIndex = '';
      }

      // ------------------------------------------------------------------
      // Phase 2: Gather Recent Signal
      // ------------------------------------------------------------------
      gatherPhase = startPhase(gatherPhase);

      try {
        const [dailyLogSignals, driftSignals, transcriptSignals] = await Promise.all([
          gatherFromDailyLogs(this.signalOptions),
          gatherFromDriftedMemories(existingMemories, this.signalOptions),
          gatherFromTranscripts(this.signalOptions),
        ]);

        const rawSignals = [
          ...dailyLogSignals,
          ...driftSignals,
          ...transcriptSignals,
        ];

        allSignals = prioritizeSignals(rawSignals);
        signalsProcessed = allSignals.length;

        gatherPhase = completePhase(gatherPhase);

        await this.audit.append({
          timestamp: new Date().toISOString(),
          agent: 'meridian',
          action: 'consolidation.phase.gather',
          outcome: 'success',
          metadata: {
            dailyLogSignals: dailyLogSignals.length,
            driftSignals: driftSignals.length,
            transcriptSignals: transcriptSignals.length,
            totalAfterPrioritization: allSignals.length,
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        gatherPhase = failPhase(gatherPhase, msg);
        errors.push(`Gather phase failed: ${msg}`);
        // Non-fatal — we can still prune and re-index
      }

      // ------------------------------------------------------------------
      // Phase 3: Consolidate
      // ------------------------------------------------------------------
      consolidatePhase = startPhase(consolidatePhase);

      try {
        // 3a: Detect contradictions and resolve them
        const contradictions = detectContradictions(existingMemories, allSignals);

        for (const contradiction of contradictions) {
          // Delete the contradicted memory — the signal will create a replacement
          const deleted = await this.store.deleteMemoryFile(contradiction.existingMemory.id);
          if (deleted) {
            memoriesDeleted++;
            existingMemories = existingMemories.filter(
              m => m.id !== contradiction.existingMemory.id,
            );

            await this.audit.append({
              timestamp: new Date().toISOString(),
              agent: 'meridian',
              action: 'consolidation.memory.deleted',
              outcome: 'success',
              metadata: {
                memoryId: contradiction.existingMemory.id,
                reason: contradiction.conflictDescription,
              },
            });
          }
        }

        // 3b: Normalize temporal references in existing memories
        for (const memory of existingMemories) {
          const anchorDate = new Date(memory.updatedAt);
          const normalized = normalizeTemporalReferences(memory.content, anchorDate);

          if (normalized !== memory.content) {
            const updated: MemoryEntry = {
              ...memory,
              content: normalized,
              updatedAt: new Date().toISOString(),
            };
            await this.store.writeMemoryFile(updated);
            memoriesUpdated++;
          }
        }

        // 3c: Process high-relevance signals into new or updated memories
        const processedMemoryIds = new Set(existingMemories.map(m => m.id));

        for (const signal of allSignals) {
          if (signal.relevance < 0.5) continue; // Only consolidate strong signals

          // Check if signal updates an existing memory (by keyword match)
          const matchedMemory = findBestMatchingMemory(signal, existingMemories);

          if (matchedMemory !== null) {
            // Update existing memory — append signal content
            const updatedContent = mergeSignalIntoMemory(matchedMemory, signal);
            if (updatedContent !== matchedMemory.content) {
              const updated: MemoryEntry = {
                ...matchedMemory,
                content: updatedContent,
                updatedAt: new Date().toISOString(),
              };
              await this.store.writeMemoryFile(updated);
              memoriesUpdated++;

              // Update our in-memory copy
              const idx = existingMemories.findIndex(m => m.id === matchedMemory.id);
              if (idx !== -1) {
                existingMemories[idx] = updated;
              }
            }
          } else if (signal.source === 'transcript' && signal.relevance >= 0.7) {
            // Create a new memory from a high-quality transcript signal
            const newId = generateMemoryId(signal);
            if (!processedMemoryIds.has(newId)) {
              const newEntry: MemoryEntry = {
                id: newId,
                type: inferMemoryType(signal),
                name: extractMemoryName(signal),
                description: `Consolidated from ${signal.source} on ${signal.timestamp.slice(0, 10)}`,
                content: signal.content,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                filePath: `memories/${newId}.mem`,
              };
              await this.store.writeMemoryFile(newEntry);
              existingMemories.push(newEntry);
              processedMemoryIds.add(newId);
              memoriesCreated++;
            }
          }
        }

        consolidatePhase = completePhase(consolidatePhase);

        await this.audit.append({
          timestamp: new Date().toISOString(),
          agent: 'meridian',
          action: 'consolidation.phase.consolidate',
          outcome: 'success',
          metadata: {
            contradictionsResolved: contradictions.length,
            memoriesCreated,
            memoriesUpdated,
            memoriesDeleted,
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        consolidatePhase = failPhase(consolidatePhase, msg);
        errors.push(`Consolidate phase failed: ${msg}`);
      }

      // ------------------------------------------------------------------
      // Phase 4: Prune & Index
      // ------------------------------------------------------------------
      prunePhase = startPhase(prunePhase);

      try {
        // 4a: Re-read all memories (may have changed during consolidation)
        const finalMemories = await this.store.listMemoryFiles();

        // 4b: Remove stale pointers — memories referenced in index but no longer on disk
        // (This is naturally handled by regenerating the index from actual files)

        // 4c: Generate fresh MEMORY.md under the line limit
        const newIndex = generateMemoryIndex(finalMemories, this.config.maxMemoryLines);
        await this.store.writeMemoryIndex(newIndex);

        indexLinesAfter = newIndex.split('\n').length;

        prunePhase = completePhase(prunePhase);

        await this.audit.append({
          timestamp: new Date().toISOString(),
          agent: 'meridian',
          action: 'consolidation.phase.prune',
          outcome: 'success',
          metadata: {
            totalMemories: finalMemories.length,
            indexLinesBefore,
            indexLinesAfter,
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        prunePhase = failPhase(prunePhase, msg);
        errors.push(`Prune phase failed: ${msg}`);
      }

      // ------------------------------------------------------------------
      // Update state
      // ------------------------------------------------------------------
      const state = await this.store.readState();
      const updatedState: MeridianState = {
        ...state,
        lastConsolidation: new Date().toISOString(),
        sessionsSinceLastConsolidation: 0,
        isLocked: false,
        lockHolder: null,
        lockAcquiredAt: null,
      };
      await this.store.writeState(updatedState);

    } finally {
      // Always release the lock, even on error
      await this.gates.releaseLock();
    }

    const completedAt = new Date().toISOString();
    const success = errors.length === 0;

    // Audit: consolidation completed
    await this.audit.append({
      timestamp: completedAt,
      agent: 'meridian',
      action: success ? 'consolidation.completed' : 'consolidation.completed_with_errors',
      outcome: success ? 'success' : 'failure',
      metadata: {
        holderId: this.holderId,
        memoriesCreated,
        memoriesUpdated,
        memoriesDeleted,
        signalsProcessed,
        errors,
      },
    });

    return {
      success,
      phases: [orientPhase, gatherPhase, consolidatePhase, prunePhase],
      startedAt,
      completedAt,
      memoriesCreated,
      memoriesUpdated,
      memoriesDeleted,
      signalsProcessed,
      indexLinesBefore,
      indexLinesAfter,
      errors,
    };
  }

  // -----------------------------------------------------------------------
  // Convenience: check gates then consolidate if appropriate
  // -----------------------------------------------------------------------

  /**
   * High-level entry point: checks all gates and runs consolidation only
   * if all three pass. Returns `null` if gates did not pass.
   */
  async dreamIfReady(): Promise<ConsolidationResult | null> {
    const gateResult = await this.shouldConsolidate();

    if (!gateResult.allPassed) {
      await this.audit.append({
        timestamp: new Date().toISOString(),
        agent: 'meridian',
        action: 'consolidation.skipped',
        outcome: 'success',
        metadata: {
          timeGate: gateResult.time.passed,
          sessionGate: gateResult.session.passed,
          lockGate: gateResult.lock.acquired,
        },
      });
      return null;
    }

    return this.consolidate();
  }

  // -----------------------------------------------------------------------
  // Accessors for external inspection
  // -----------------------------------------------------------------------

  get memoryStore(): MemoryStore {
    return this.store;
  }

  get gateCoordinator(): GateCoordinator {
    return this.gates;
  }
}

// ---------------------------------------------------------------------------
// Consolidation helpers
// ---------------------------------------------------------------------------

/**
 * Finds the existing memory that best matches an incoming signal,
 * based on keyword overlap. Returns `null` if no good match is found.
 */
function findBestMatchingMemory(
  signal: ConsolidationSignal,
  memories: MemoryEntry[],
): MemoryEntry | null {
  const signalKeywords = extractKeywords(signal.content);
  let bestMatch: MemoryEntry | null = null;
  let bestScore = 0;
  const threshold = 0.25;

  for (const memory of memories) {
    const memoryKeywords = extractKeywords(
      `${memory.name} ${memory.description} ${memory.content}`,
    );
    const score = computeKeywordOverlap(signalKeywords, memoryKeywords);

    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = memory;
    }
  }

  return bestMatch;
}

/**
 * Merges a signal's content into an existing memory.
 * Appends the signal content as a dated update section.
 */
function mergeSignalIntoMemory(memory: MemoryEntry, signal: ConsolidationSignal): string {
  const dateStr = signal.timestamp.slice(0, 10);
  const sourceLabel = signal.source.replace('_', ' ');
  const updateBlock = `\n\n---\n*Updated ${dateStr} (from ${sourceLabel}):*\n${signal.content}`;

  return memory.content + updateBlock;
}

/**
 * Generates a deterministic memory ID from a signal.
 */
function generateMemoryId(signal: ConsolidationSignal): string {
  // Create a slug from the first meaningful words
  const words = signal.content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 4);

  const slug = words.join('-') || 'unnamed';
  const timestamp = signal.timestamp.replace(/[^0-9]/g, '').slice(0, 12);
  return `${slug}-${timestamp}`;
}

/**
 * Infers the MemoryType from signal content heuristics.
 */
function inferMemoryType(signal: ConsolidationSignal): MemoryType {
  const content = signal.content.toLowerCase();

  if (/\b(prefer|like|dislike|hate|always use|never use|style)\b/.test(content)) {
    return 'user';
  }
  if (/\b(decided|decision|chose|commit to|going with)\b/.test(content)) {
    return 'decision';
  }
  if (/\b(project|repo|codebase|deploy|release|sprint)\b/.test(content)) {
    return 'project';
  }
  if (/\b(company|business|revenue|client|customer|market)\b/.test(content)) {
    return 'business';
  }
  if (/\b(feedback|correction|wrong|fix|improve)\b/.test(content)) {
    return 'feedback';
  }

  return 'reference';
}

/**
 * Extracts a short name for a new memory from signal content.
 */
function extractMemoryName(signal: ConsolidationSignal): string {
  // Take the first sentence or first 60 characters
  const firstSentence = signal.content.split(/[.!?\n]/)[0]?.trim() ?? '';
  if (firstSentence.length <= 60) return firstSentence;
  return firstSentence.slice(0, 57) + '...';
}
