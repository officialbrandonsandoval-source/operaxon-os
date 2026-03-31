// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * Storage — persistent memory files (JSON + markdown) for MERIDIAN.
 *
 * Two stores:
 *  1. Structured JSON store — for machine-readable memory (agent data, metrics, config)
 *  2. Markdown store — for human-readable daily logs and lessons
 *
 * The keyword search (meridian.search()) is implemented here.
 * Phase 2 uses simple keyword overlap; Phase 3 can swap in vector embeddings.
 */

import {
  readFile,
  writeFile,
  readdir,
  mkdir,
  unlink,
  rename,
  stat,
} from 'node:fs/promises';
import { join, extname } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JsonRecord {
  id: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

export interface SearchResult {
  record: JsonRecord | MarkdownEntry;
  score: number;
  kind: 'json' | 'markdown';
}

export interface MarkdownEntry {
  id: string;
  filename: string;
  title: string;
  content: string;
  date: string;
  tags: string[];
}

export interface StorageOptions {
  basePath: string;
  jsonDir?: string;
  markdownDir?: string;
}

// ---------------------------------------------------------------------------
// JsonStore — structured records
// ---------------------------------------------------------------------------

export class JsonStore {
  private readonly dir: string;
  private cache: Map<string, JsonRecord> = new Map();
  private cacheLoaded = false;

  constructor(dir: string) {
    this.dir = dir;
  }

  async initialize(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  /**
   * Write a record (create or update).
   */
  async write(record: JsonRecord): Promise<void> {
    const filePath = join(this.dir, `${sanitizeId(record.id)}.json`);
    const updated: JsonRecord = { ...record, updatedAt: new Date().toISOString() };
    await atomicWrite(filePath, JSON.stringify(updated, null, 2));
    this.cache.set(record.id, updated);
  }

  /**
   * Read a record by id.
   */
  async read(id: string): Promise<JsonRecord | null> {
    if (this.cache.has(id)) return this.cache.get(id)!;

    const filePath = join(this.dir, `${sanitizeId(id)}.json`);
    try {
      const raw = await readFile(filePath, 'utf8');
      const record = JSON.parse(raw) as JsonRecord;
      this.cache.set(id, record);
      return record;
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') return null;
      throw err;
    }
  }

  /**
   * List all records (optionally filtered by type).
   */
  async list(type?: string): Promise<JsonRecord[]> {
    if (!this.cacheLoaded) {
      await this.loadAll();
    }
    const all = Array.from(this.cache.values());
    if (type === undefined) return all;
    return all.filter(r => r.type === type);
  }

  /**
   * Delete a record by id.
   */
  async delete(id: string): Promise<boolean> {
    const filePath = join(this.dir, `${sanitizeId(id)}.json`);
    try {
      await unlink(filePath);
      this.cache.delete(id);
      return true;
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') return false;
      throw err;
    }
  }

  /**
   * Search records by keyword. Returns scored results sorted by relevance.
   */
  search(query: string, topK: number = 5): Promise<Array<{ record: JsonRecord; score: number }>> {
    return this.list().then(records => {
      const queryWords = tokenize(query);
      const scored = records.map(record => {
        const recordText = [
          record.id,
          record.type,
          ...record.tags,
          JSON.stringify(record.data),
        ].join(' ');
        const score = keywordScore(queryWords, tokenize(recordText));
        return { record, score };
      });

      return scored
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    });
  }

  private async loadAll(): Promise<void> {
    let files: string[];
    try {
      files = await readdir(this.dir);
    } catch {
      files = [];
    }

    for (const file of files.filter(f => extname(f) === '.json')) {
      const id = file.replace('.json', '');
      if (!this.cache.has(id)) {
        try {
          const raw = await readFile(join(this.dir, file), 'utf8');
          const record = JSON.parse(raw) as JsonRecord;
          this.cache.set(record.id, record);
        } catch {
          continue;
        }
      }
    }
    this.cacheLoaded = true;
  }
}

// ---------------------------------------------------------------------------
// MarkdownStore — daily logs and lesson files
// ---------------------------------------------------------------------------

export class MarkdownStore {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  async initialize(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  /**
   * Read a markdown file by filename (e.g. '2026-03-31.md').
   */
  async read(filename: string): Promise<MarkdownEntry | null> {
    const filePath = join(this.dir, filename);
    try {
      const content = await readFile(filePath, 'utf8');
      return parseMarkdownEntry(filename, content);
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') return null;
      throw err;
    }
  }

  /**
   * Write a markdown file atomically.
   */
  async write(filename: string, content: string): Promise<void> {
    const filePath = join(this.dir, filename);
    await atomicWrite(filePath, content);
  }

  /**
   * Append content to a markdown file (creates if not exists).
   */
  async append(filename: string, content: string): Promise<void> {
    const filePath = join(this.dir, filename);
    let existing = '';
    try {
      existing = await readFile(filePath, 'utf8');
    } catch {
      existing = '';
    }
    await atomicWrite(filePath, existing + content);
  }

  /**
   * List all markdown files sorted by date (newest first).
   */
  async list(): Promise<MarkdownEntry[]> {
    let files: string[];
    try {
      files = await readdir(this.dir);
    } catch {
      return [];
    }

    const mdFiles = files
      .filter(f => extname(f) === '.md')
      .sort()
      .reverse();

    const entries: MarkdownEntry[] = [];
    for (const file of mdFiles) {
      try {
        const content = await readFile(join(this.dir, file), 'utf8');
        entries.push(parseMarkdownEntry(file, content));
      } catch {
        continue;
      }
    }

    return entries;
  }

  /**
   * Search markdown files by keyword. Returns scored results.
   */
  async search(query: string, topK: number = 5): Promise<Array<{ entry: MarkdownEntry; score: number; snippet: string }>> {
    const entries = await this.list();
    const queryWords = tokenize(query);

    const scored = entries.map(entry => {
      const score = keywordScore(queryWords, tokenize(entry.content));
      const snippet = extractSnippet(entry.content, query);
      return { entry, score, snippet };
    });

    return scored
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Get the modification time of a file.
   */
  async mtime(filename: string): Promise<Date | null> {
    try {
      const s = await stat(join(this.dir, filename));
      return s.mtime;
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// MeridianStorage — unified search across both stores
// ---------------------------------------------------------------------------

export class MeridianStorage {
  readonly json: JsonStore;
  readonly markdown: MarkdownStore;

  constructor(options: StorageOptions) {
    this.json = new JsonStore(options.jsonDir ?? join(options.basePath, 'records'));
    this.markdown = new MarkdownStore(options.markdownDir ?? join(options.basePath, 'memory'));
  }

  async initialize(): Promise<void> {
    await Promise.all([this.json.initialize(), this.markdown.initialize()]);
  }

  /**
   * Unified keyword search across all memory stores.
   * Returns ranked snippets with source info.
   *
   * This is the `meridian.search()` function agents use.
   *
   * @example
   * const results = await storage.search('what have we learned about deployment?');
   * // returns: [{content: '...', source: 'memory/2026-03-31.md', score: 0.8}, ...]
   */
  async search(query: string, topK: number = 5): Promise<MemorySnippet[]> {
    const [jsonResults, mdResults] = await Promise.all([
      this.json.search(query, topK),
      this.markdown.search(query, topK),
    ]);

    const snippets: MemorySnippet[] = [
      ...jsonResults.map(r => ({
        content: `[${r.record.type}] ${JSON.stringify(r.record.data).slice(0, 200)}`,
        source: `records/${r.record.id}.json`,
        score: r.score,
        date: r.record.updatedAt,
        tags: r.record.tags,
      })),
      ...mdResults.map(r => ({
        content: r.snippet || r.entry.content.slice(0, 300),
        source: `memory/${r.entry.filename}`,
        score: r.score,
        date: r.entry.date,
        tags: r.entry.tags,
      })),
    ];

    // Sort by score, return top K
    return snippets
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

// ---------------------------------------------------------------------------
// Types (public)
// ---------------------------------------------------------------------------

export interface MemorySnippet {
  content: string;
  source: string;
  score: number;
  date: string;
  tags: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function atomicWrite(targetPath: string, data: string): Promise<void> {
  const tmpPath = targetPath + '.tmp';
  await writeFile(tmpPath, data, 'utf8');
  await rename(tmpPath, targetPath);
}

function parseMarkdownEntry(filename: string, content: string): MarkdownEntry {
  const dateStr = filename.replace('.md', '');
  const titleMatch = /^#\s+(.+)$/m.exec(content);
  const title = titleMatch?.[1] ?? dateStr;

  // Extract tags from content (lines starting with #tag or words in brackets)
  const tagMatches = [...content.matchAll(/\btag:([a-z0-9-]+)\b/gi)];
  const tags = tagMatches.map(m => m[1] ?? '').filter(t => t.length > 0);

  return {
    id: dateStr,
    filename,
    title,
    content,
    date: dateStr,
    tags,
  };
}

/** Simple keyword tokenizer (removes stop words, lowercases) */
function tokenize(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'and',
    'but', 'or', 'if', 'that', 'this', 'it', 'its', 'i', 'we',
    'you', 'he', 'she', 'they', 'from', 'as', 'not', 'no',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

/** Keyword overlap score: intersection / min(|A|, |B|) */
function keywordScore(queryWords: string[], docWords: string[]): number {
  if (queryWords.length === 0 || docWords.length === 0) return 0;
  const docSet = new Set(docWords);
  let intersection = 0;
  for (const word of queryWords) {
    if (docSet.has(word)) intersection++;
  }
  return intersection / queryWords.length;
}

/** Extract a snippet from content that contains the query keywords */
function extractSnippet(content: string, query: string): string {
  const queryWords = tokenize(query);
  const lines = content.split('\n');

  let bestLine = '';
  let bestScore = 0;

  for (const line of lines) {
    const lineWords = tokenize(line);
    const score = keywordScore(queryWords, lineWords);
    if (score > bestScore) {
      bestScore = score;
      bestLine = line;
    }
  }

  // Return surrounding context (the matching line + 1 before and after)
  if (bestLine === '') return content.slice(0, 200);
  const idx = lines.indexOf(bestLine);
  const start = Math.max(0, idx - 1);
  const end = Math.min(lines.length - 1, idx + 2);
  return lines.slice(start, end).join('\n').trim().slice(0, 300);
}

interface NodeError extends Error {
  code?: string;
}

function isNodeError(err: unknown): err is NodeError {
  return err instanceof Error && 'code' in err;
}
