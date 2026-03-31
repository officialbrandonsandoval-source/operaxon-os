// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * Synthesizer — extracts patterns, identifies contradictions, and writes lessons.
 *
 * Takes raw agent logs and session transcripts and produces structured lessons
 * suitable for writing to memory/YYYY-MM-DD.md.
 *
 * Philosophy: Extract signal, discard noise. 1-2 lessons per session is ideal.
 * Every lesson must be actionable or durable — not a one-time observation.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Lesson {
  /** Short summary of the lesson (one sentence) */
  headline: string;
  /** Full explanation with context */
  detail: string;
  /** Category for indexing */
  category: LessonCategory;
  /** Confidence: how sure are we this is a durable lesson (0-1) */
  confidence: number;
  /** Source that generated this lesson */
  source: string;
  /** ISO timestamp */
  extractedAt: string;
}

export type LessonCategory =
  | 'pattern'      // recurring behavior worth codifying
  | 'correction'   // a mistake that should not repeat
  | 'decision'     // a commitment made that should be remembered
  | 'process'      // a workflow improvement
  | 'context'      // background information for future sessions
  | 'warning';     // something to watch out for

export interface SynthesisResult {
  lessons: Lesson[];
  sessionId: string;
  agentId: string;
  processedAt: string;
  patternsFound: number;
  contradictionsFound: number;
}

export interface SynthesizerOptions {
  /** Max lessons to extract per session (default 2) */
  maxLessonsPerSession?: number;
  /** Min confidence to include a lesson (default 0.5) */
  minConfidence?: number;
  /** Storage path for reading existing memory files */
  storagePath?: string;
}

// ---------------------------------------------------------------------------
// Synthesizer
// ---------------------------------------------------------------------------

export class Synthesizer {
  private readonly maxLessons: number;
  private readonly minConfidence: number;
  private readonly storagePath: string;

  constructor(options: SynthesizerOptions = {}) {
    this.maxLessons = options.maxLessonsPerSession ?? 2;
    this.minConfidence = options.minConfidence ?? 0.5;
    this.storagePath = options.storagePath ?? './data/memory';
  }

  // -----------------------------------------------------------------------
  // Primary API
  // -----------------------------------------------------------------------

  /**
   * Extract lessons from a session log string.
   * Call with the raw text content of a session transcript.
   */
  extractFromSession(
    content: string,
    sessionId: string,
    agentId: string,
  ): SynthesisResult {
    const now = new Date().toISOString();
    const candidates: Lesson[] = [];
    let contradictionsFound = 0;

    // Extract corrections (highest value)
    const corrections = this.extractCorrections(content, sessionId);
    for (const c of corrections) {
      if (c.contradiction) contradictionsFound++;
      candidates.push(c.lesson);
    }

    // Extract decisions
    const decisions = this.extractDecisions(content, sessionId);
    candidates.push(...decisions);

    // Extract patterns
    const patterns = this.extractPatterns(content, sessionId);
    candidates.push(...patterns);

    // Extract process improvements
    const processLessons = this.extractProcessLessons(content, sessionId);
    candidates.push(...processLessons);

    // Filter by confidence and deduplicate
    const filtered = candidates
      .filter(l => l.confidence >= this.minConfidence)
      .sort((a, b) => b.confidence - a.confidence);

    const deduplicated = this.deduplicateLessons(filtered);
    const lessons = deduplicated.slice(0, this.maxLessons);

    return {
      lessons,
      sessionId,
      agentId,
      processedAt: now,
      patternsFound: patterns.length,
      contradictionsFound,
    };
  }

  /**
   * Format a SynthesisResult into a markdown lesson block
   * suitable for writing to memory/YYYY-MM-DD.md.
   */
  formatAsMarkdown(result: SynthesisResult): string {
    if (result.lessons.length === 0) {
      return `### Session ${result.sessionId}\n_No durable lessons extracted._\n`;
    }

    const lines: string[] = [
      `### Session ${result.sessionId} (${result.agentId})`,
      '',
    ];

    for (const lesson of result.lessons) {
      const categoryIcon = categoryToIcon(lesson.category);
      lines.push(`**${categoryIcon} ${lesson.headline}**`);
      lines.push('');
      lines.push(lesson.detail);
      if (lesson.confidence < 0.7) {
        lines.push('');
        lines.push(`_Confidence: ${Math.round(lesson.confidence * 100)}% — monitor for confirmation_`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Read all existing daily memory files and extract a summary of recent patterns.
   * Returns an array of lesson headlines for context.
   */
  async getRecentPatterns(lookbackDays: number = 7): Promise<string[]> {
    const memoryDir = join(this.storagePath, 'memory');
    let files: string[];

    try {
      files = await readdir(memoryDir);
    } catch {
      return [];
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookbackDays);

    const patterns: string[] = [];

    for (const file of files.filter(f => extname(f) === '.md').sort().reverse()) {
      const dateStr = file.replace('.md', '');
      const fileDate = new Date(dateStr);
      if (fileDate < cutoff) continue;

      try {
        const content = await readFile(join(memoryDir, file), 'utf8');
        // Extract headlines (bold text) from the file
        const headlines = extractBoldLines(content);
        patterns.push(...headlines);
      } catch {
        continue;
      }
    }

    return patterns.slice(0, 20); // Top 20 patterns max
  }

  // -----------------------------------------------------------------------
  // Extraction helpers
  // -----------------------------------------------------------------------

  private extractCorrections(
    content: string,
    source: string,
  ): Array<{ lesson: Lesson; contradiction: boolean }> {
    const results: Array<{ lesson: Lesson; contradiction: boolean }> = [];

    const correctionPatterns = [
      { pattern: /(?:actually|correction|wrong|that'?s not right)[,:]?\s*(.{20,200})/gi, boost: 0.3 },
      { pattern: /(?:I (?:was|made a) (?:wrong|mistake|incorrect))[^.]*\.\s*(.{20,200})/gi, boost: 0.25 },
      { pattern: /(?:don'?t do this|never|avoid)[,:]?\s*(.{20,150})/gi, boost: 0.2 },
      { pattern: /(?:the right way|correct approach|should instead)[,:]?\s*(.{20,200})/gi, boost: 0.2 },
    ];

    for (const { pattern, boost } of correctionPatterns) {
      const matches = [...content.matchAll(pattern)];
      for (const match of matches.slice(0, 2)) {
        const detail = (match[1] ?? match[0]).trim();
        if (detail.length < 20) continue;

        results.push({
          lesson: {
            headline: truncate(stripMarkdown(detail), 80),
            detail: `Correction identified: ${detail}`,
            category: 'correction',
            confidence: 0.6 + boost,
            source,
            extractedAt: new Date().toISOString(),
          },
          contradiction: boost >= 0.25,
        });
      }
    }

    return results;
  }

  private extractDecisions(content: string, source: string): Lesson[] {
    const lessons: Lesson[] = [];

    const decisionPatterns = [
      /(?:decided to|going with|committed to|chose|selected)[,:]?\s*(.{20,200})/gi,
      /(?:the plan is|we will|I will|this means)[,:]?\s*(.{20,200})/gi,
      /(?:final decision|conclusion)[,:]?\s*(.{20,200})/gi,
    ];

    for (const pattern of decisionPatterns) {
      const matches = [...content.matchAll(pattern)];
      for (const match of matches.slice(0, 2)) {
        const detail = (match[1] ?? match[0]).trim();
        if (detail.length < 20) continue;

        lessons.push({
          headline: truncate(stripMarkdown(detail), 80),
          detail: `Decision recorded: ${detail}`,
          category: 'decision',
          confidence: 0.65,
          source,
          extractedAt: new Date().toISOString(),
        });
      }
    }

    return lessons;
  }

  private extractPatterns(content: string, source: string): Lesson[] {
    const lessons: Lesson[] = [];

    const patternIndicators = [
      /(?:every time|always|consistently|pattern)[,:]?\s*(.{20,200})/gi,
      /(?:keeps happening|tends to|usually)[,:]?\s*(.{20,200})/gi,
      /(?:I (?:notice|observed|found that))[,:]?\s*(.{20,200})/gi,
    ];

    for (const pattern of patternIndicators) {
      const matches = [...content.matchAll(pattern)];
      for (const match of matches.slice(0, 2)) {
        const detail = (match[1] ?? match[0]).trim();
        if (detail.length < 20) continue;

        lessons.push({
          headline: truncate(stripMarkdown(detail), 80),
          detail: `Pattern: ${detail}`,
          category: 'pattern',
          confidence: 0.55,
          source,
          extractedAt: new Date().toISOString(),
        });
      }
    }

    return lessons;
  }

  private extractProcessLessons(content: string, source: string): Lesson[] {
    const lessons: Lesson[] = [];

    const processPatterns = [
      /(?:faster to|better approach|more efficient|improved workflow)[,:]?\s*(.{20,200})/gi,
      /(?:use this next time|remember to|do this first)[,:]?\s*(.{20,200})/gi,
      /(?:lesson learned|takeaway|key insight)[,:]?\s*(.{20,200})/gi,
    ];

    for (const pattern of processPatterns) {
      const matches = [...content.matchAll(pattern)];
      for (const match of matches.slice(0, 2)) {
        const detail = (match[1] ?? match[0]).trim();
        if (detail.length < 20) continue;

        lessons.push({
          headline: truncate(stripMarkdown(detail), 80),
          detail: `Process improvement: ${detail}`,
          category: 'process',
          confidence: 0.6,
          source,
          extractedAt: new Date().toISOString(),
        });
      }
    }

    return lessons;
  }

  private deduplicateLessons(lessons: Lesson[]): Lesson[] {
    const result: Lesson[] = [];
    for (const lesson of lessons) {
      const isDuplicate = result.some(existing => {
        const overlap = computeWordOverlap(existing.headline, lesson.headline);
        return overlap > 0.6;
      });
      if (!isDuplicate) {
        result.push(lesson);
      }
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function categoryToIcon(category: LessonCategory): string {
  const icons: Record<LessonCategory, string> = {
    pattern: '🔁',
    correction: '⚠️',
    decision: '✅',
    process: '⚙️',
    context: '📌',
    warning: '🚨',
  };
  return icons[category] ?? '📝';
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`/g, '')
    .replace(/#/g, '')
    .trim();
}

function extractBoldLines(content: string): string[] {
  const matches = [...content.matchAll(/\*\*(.+?)\*\*/g)];
  return matches.map(m => m[1] ?? '').filter(s => s.length > 0);
}

function computeWordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }
  return intersection / Math.min(wordsA.size, wordsB.size);
}
