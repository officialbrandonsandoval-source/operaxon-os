// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import type {
  ConsolidationSignal,
  SignalSource,
  MemoryEntry,
} from '@operaxon/types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface SignalGatherOptions {
  /** Root path of the memory storage directory. */
  storagePath: string;
  /** How far back (in milliseconds) to look for daily logs. Default: 7 days. */
  dailyLogWindowMs: number;
  /** How far back (in milliseconds) to look for transcripts. Default: 48 hours. */
  transcriptWindowMs: number;
  /** Maximum number of signals to return from each source. Default: 50. */
  maxSignalsPerSource: number;
}

const DEFAULT_OPTIONS: Omit<SignalGatherOptions, 'storagePath'> = {
  dailyLogWindowMs: 7 * 24 * 60 * 60 * 1000,      // 7 days
  transcriptWindowMs: 48 * 60 * 60 * 1000,          // 48 hours
  maxSignalsPerSource: 50,
};

export function createSignalOptions(
  storagePath: string,
  overrides?: Partial<Omit<SignalGatherOptions, 'storagePath'>>,
): SignalGatherOptions {
  return {
    storagePath,
    ...DEFAULT_OPTIONS,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Daily log signals
// ---------------------------------------------------------------------------

/**
 * Reads daily log files from the `daily-logs/` subdirectory.
 * Each log file is expected to be a plain-text file named `YYYY-MM-DD.log`.
 *
 * Returns one signal per non-empty log entry found within the time window.
 */
export async function gatherFromDailyLogs(
  options: SignalGatherOptions,
): Promise<ConsolidationSignal[]> {
  const logsDir = join(options.storagePath, 'daily-logs');
  const files = await safeReaddir(logsDir);

  if (files.length === 0) return [];

  const cutoff = Date.now() - options.dailyLogWindowMs;
  const signals: ConsolidationSignal[] = [];

  // Sort descending so we process most-recent first
  const logFiles = files
    .filter(f => extname(f) === '.log')
    .sort()
    .reverse();

  for (const file of logFiles) {
    if (signals.length >= options.maxSignalsPerSource) break;

    const dateStr = file.replace('.log', '');
    const fileDate = parseDateString(dateStr);
    if (fileDate === null || fileDate.getTime() < cutoff) continue;

    const filePath = join(logsDir, file);
    const content = await safeReadFile(filePath);
    if (content.length === 0) continue;

    // Split log into individual entries (separated by blank lines)
    const entries = splitLogEntries(content);

    for (const entry of entries) {
      if (signals.length >= options.maxSignalsPerSource) break;

      const relevance = computeDailyLogRelevance(entry, fileDate);
      signals.push({
        source: 'daily_log' as SignalSource,
        content: entry,
        relevance,
        timestamp: fileDate.toISOString(),
      });
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Drifted memory signals
// ---------------------------------------------------------------------------

/**
 * Identifies memories that may have "drifted" — their content may no longer
 * accurately reflect reality. Drift indicators:
 *
 * 1. Memory not updated in a long time relative to its type
 * 2. Memory contains temporal references ("last week", "recently") that are stale
 * 3. Memory references entities/topics that appear in recent contradictory signals
 */
export async function gatherFromDriftedMemories(
  memories: MemoryEntry[],
  _options: SignalGatherOptions,
): Promise<ConsolidationSignal[]> {
  const signals: ConsolidationSignal[] = [];
  const now = Date.now();

  for (const memory of memories) {
    const updatedAt = new Date(memory.updatedAt).getTime();
    const ageDays = (now - updatedAt) / (1000 * 60 * 60 * 24);

    // Check for stale temporal references in content
    const hasStaleTemporal = containsStaleTemporalReferences(memory.content, ageDays);

    // Check age thresholds by memory type
    const ageThreshold = getAgeThresholdDays(memory.type);
    const isStaleByAge = ageDays > ageThreshold;

    // Check for vague or uncertain language
    const hasUncertainLanguage = containsUncertainLanguage(memory.content);

    if (!hasStaleTemporal && !isStaleByAge && !hasUncertainLanguage) continue;

    // Compute relevance — higher means more likely drifted
    let relevance = 0;
    if (isStaleByAge) relevance += 0.4;
    if (hasStaleTemporal) relevance += 0.35;
    if (hasUncertainLanguage) relevance += 0.25;
    relevance = Math.min(relevance, 1.0);

    const driftReason = buildDriftReason(isStaleByAge, hasStaleTemporal, hasUncertainLanguage, ageDays);

    signals.push({
      source: 'drifted_memory' as SignalSource,
      content: `[DRIFT] Memory "${memory.name}" (${memory.id}): ${driftReason}\n---\n${memory.content}`,
      relevance,
      timestamp: memory.updatedAt,
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Transcript signals
// ---------------------------------------------------------------------------

/**
 * Searches recent session transcripts for consolidation-relevant content.
 * Transcripts are stored in `transcripts/` as `{session-id}.transcript` files.
 *
 * Extracts signals from:
 * - Explicit user corrections ("actually, ...", "that's wrong", "no, ...")
 * - Decisions and commitments
 * - New factual information
 * - Preference statements
 */
export async function gatherFromTranscripts(
  options: SignalGatherOptions,
): Promise<ConsolidationSignal[]> {
  const transcriptsDir = join(options.storagePath, 'transcripts');
  const files = await safeReaddir(transcriptsDir);

  if (files.length === 0) return [];

  const cutoff = Date.now() - options.transcriptWindowMs;
  const signals: ConsolidationSignal[] = [];

  // Filter to transcript files and sort by modification time
  const transcriptFiles = files.filter(f => extname(f) === '.transcript');
  const filesWithStats = await Promise.all(
    transcriptFiles.map(async f => {
      const filePath = join(transcriptsDir, f);
      const fileStat = await safeStat(filePath);
      return { file: f, path: filePath, mtime: fileStat?.mtimeMs ?? 0 };
    }),
  );

  // Most recent first
  const recentFiles = filesWithStats
    .filter(f => f.mtime >= cutoff)
    .sort((a, b) => b.mtime - a.mtime);

  for (const { path: filePath, mtime } of recentFiles) {
    if (signals.length >= options.maxSignalsPerSource) break;

    const content = await safeReadFile(filePath);
    if (content.length === 0) continue;

    const extracted = extractTranscriptSignals(content, mtime);

    for (const sig of extracted) {
      if (signals.length >= options.maxSignalsPerSource) break;
      signals.push(sig);
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Signal prioritization
// ---------------------------------------------------------------------------

/**
 * Sorts and deduplicates signals across all sources.
 *
 * Priority order:
 * 1. Higher relevance scores first
 * 2. Within the same relevance tier, more recent signals first
 * 3. Corrections from transcripts get a boost
 *
 * Deduplication: signals with substantially similar content (>80% overlap)
 * are collapsed, keeping the highest-relevance version.
 */
export function prioritizeSignals(
  signals: ConsolidationSignal[],
  maxResults: number = 100,
): ConsolidationSignal[] {
  // Apply source-based boosts
  const boosted = signals.map(sig => ({
    ...sig,
    relevance: applySourceBoost(sig),
  }));

  // Deduplicate by content similarity
  const deduplicated = deduplicateSignals(boosted);

  // Sort by relevance (desc), then by timestamp (desc)
  deduplicated.sort((a, b) => {
    const relevanceDiff = b.relevance - a.relevance;
    if (Math.abs(relevanceDiff) > 0.01) return relevanceDiff;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return deduplicated.slice(0, maxResults);
}

// ---------------------------------------------------------------------------
// Internal: daily log helpers
// ---------------------------------------------------------------------------

function splitLogEntries(content: string): string[] {
  return content
    .split(/\n\n+/)
    .map(e => e.trim())
    .filter(e => e.length > 0);
}

function computeDailyLogRelevance(entry: string, fileDate: Date): number {
  let relevance = 0.3; // base relevance

  // Recency boost
  const ageMs = Date.now() - fileDate.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays < 1) relevance += 0.3;
  else if (ageDays < 3) relevance += 0.2;
  else if (ageDays < 5) relevance += 0.1;

  // Content-quality signals
  if (entry.length > 200) relevance += 0.1; // substantial entry
  if (/\b(decision|decided|choose|chose|commit)\b/i.test(entry)) relevance += 0.15;
  if (/\b(important|critical|urgent|priority)\b/i.test(entry)) relevance += 0.1;
  if (/\b(changed|updated|new|switch)\b/i.test(entry)) relevance += 0.05;

  return Math.min(relevance, 1.0);
}

function parseDateString(dateStr: string): Date | null {
  // Expect YYYY-MM-DD format
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (match === null) return null;

  const [, yearStr, monthStr, dayStr] = match;
  if (yearStr === undefined || monthStr === undefined || dayStr === undefined) return null;

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  const date = new Date(year, month - 1, day);
  if (isNaN(date.getTime())) return null;
  return date;
}

// ---------------------------------------------------------------------------
// Internal: drift detection helpers
// ---------------------------------------------------------------------------

const STALE_TEMPORAL_PATTERNS = [
  /\b(last week|this week|yesterday|today|tomorrow)\b/i,
  /\b(recently|just now|a moment ago|earlier today)\b/i,
  /\b(this month|last month|this quarter)\b/i,
  /\b(currently|at the moment|right now|as of now)\b/i,
];

function containsStaleTemporalReferences(content: string, ageDays: number): boolean {
  // Temporal references are only "stale" if the memory is old enough
  if (ageDays < 3) return false;

  return STALE_TEMPORAL_PATTERNS.some(pattern => pattern.test(content));
}

const UNCERTAIN_PATTERNS = [
  /\b(maybe|perhaps|possibly|might be|could be|not sure|uncertain)\b/i,
  /\b(I think|I believe|I guess|probably|likely|seems like)\b/i,
  /\b(TODO|FIXME|TBD|TBC|to be confirmed)\b/i,
];

function containsUncertainLanguage(content: string): boolean {
  return UNCERTAIN_PATTERNS.some(pattern => pattern.test(content));
}

function getAgeThresholdDays(memoryType: string): number {
  switch (memoryType) {
    case 'project': return 14;    // projects change frequently
    case 'decision': return 30;   // decisions are more stable
    case 'person': return 60;     // person info drifts slowly
    case 'reference': return 90;  // reference material is fairly stable
    case 'user': return 30;       // user preferences can drift
    case 'feedback': return 7;    // feedback is time-sensitive
    case 'business': return 30;   // business context shifts
    default: return 30;
  }
}

function buildDriftReason(
  isStaleByAge: boolean,
  hasStaleTemporal: boolean,
  hasUncertainLanguage: boolean,
  ageDays: number,
): string {
  const reasons: string[] = [];
  if (isStaleByAge) reasons.push(`not updated in ${Math.round(ageDays)} days`);
  if (hasStaleTemporal) reasons.push('contains stale temporal references');
  if (hasUncertainLanguage) reasons.push('contains uncertain language');
  return reasons.join('; ');
}

// ---------------------------------------------------------------------------
// Internal: transcript extraction
// ---------------------------------------------------------------------------

/** Patterns that indicate a user correction or factual update. */
const CORRECTION_PATTERNS = [
  /\b(actually|correction|that'?s (?:wrong|incorrect|not right)|no,\s)/i,
  /\b(I (?:changed|switched|moved|updated|decided))\b/i,
  /\b(we (?:no longer|don't|stopped|aren't))\b/i,
];

/** Patterns that indicate a decision or commitment. */
const DECISION_PATTERNS = [
  /\b(decided to|going to|will|plan to|committed to)\b/i,
  /\b(let'?s go with|choose|picking|selected)\b/i,
];

/** Patterns that indicate a preference statement. */
const PREFERENCE_PATTERNS = [
  /\b(I (?:prefer|like|want|need|hate|dislike))\b/i,
  /\b(don't (?:like|want|use|need))\b/i,
  /\b(always|never)\s+(?:use|do|want)\b/i,
];

function extractTranscriptSignals(
  content: string,
  timestampMs: number,
): ConsolidationSignal[] {
  const signals: ConsolidationSignal[] = [];
  const timestamp = new Date(timestampMs).toISOString();

  // Split transcript into logical segments (by speaker turns or paragraph breaks)
  const segments = content
    .split(/\n(?=(?:User|Assistant|Human|AI):)/i)
    .filter(s => s.trim().length > 0);

  for (const segment of segments) {
    // Only process user segments (the human side of the conversation)
    if (!/^(?:User|Human):/i.test(segment.trim())) continue;

    const segmentContent = segment.replace(/^(?:User|Human):\s*/i, '').trim();
    if (segmentContent.length < 10) continue;

    let relevance = 0;
    let matched = false;

    // Check corrections (highest priority)
    if (CORRECTION_PATTERNS.some(p => p.test(segmentContent))) {
      relevance = Math.max(relevance, 0.85);
      matched = true;
    }

    // Check decisions
    if (DECISION_PATTERNS.some(p => p.test(segmentContent))) {
      relevance = Math.max(relevance, 0.7);
      matched = true;
    }

    // Check preferences
    if (PREFERENCE_PATTERNS.some(p => p.test(segmentContent))) {
      relevance = Math.max(relevance, 0.6);
      matched = true;
    }

    if (!matched) continue;

    signals.push({
      source: 'transcript' as SignalSource,
      content: segmentContent,
      relevance,
      timestamp,
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Internal: prioritization helpers
// ---------------------------------------------------------------------------

function applySourceBoost(signal: ConsolidationSignal): number {
  let boost = 0;

  // Corrections from transcripts get a significant boost
  if (signal.source === 'transcript' && signal.relevance >= 0.8) {
    boost += 0.1;
  }

  // Drifted memories with high relevance get a small boost
  if (signal.source === 'drifted_memory' && signal.relevance >= 0.7) {
    boost += 0.05;
  }

  return Math.min(signal.relevance + boost, 1.0);
}

/**
 * Removes signals with substantially overlapping content.
 * Uses a simple word-overlap metric — O(n^2) but n is bounded by maxSignalsPerSource.
 */
function deduplicateSignals(signals: ConsolidationSignal[]): ConsolidationSignal[] {
  const result: ConsolidationSignal[] = [];

  for (const signal of signals) {
    const isDuplicate = result.some(existing => {
      const overlap = computeWordOverlap(existing.content, signal.content);
      return overlap > 0.8;
    });

    if (!isDuplicate) {
      result.push(signal);
    }
  }

  return result;
}

function computeWordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const smaller = Math.min(wordsA.size, wordsB.size);
  return intersection / smaller;
}

// ---------------------------------------------------------------------------
// Internal: filesystem helpers
// ---------------------------------------------------------------------------

async function safeReaddir(dirPath: string): Promise<string[]> {
  try {
    return await readdir(dirPath);
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

async function safeReadFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      return '';
    }
    throw err;
  }
}

async function safeStat(filePath: string): Promise<{ mtimeMs: number } | null> {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

interface NodeError extends Error {
  code?: string;
}

function isNodeError(err: unknown): err is NodeError {
  return err instanceof Error && 'code' in err;
}
