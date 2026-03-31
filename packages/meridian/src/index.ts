// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

// ─── Primary agent API ───────────────────────────────────────────────────────
export { Meridian } from './meridian.js';
export type { MeridianOptions } from './meridian.js';

// ─── Consolidator (task-level API) ───────────────────────────────────────────
export { Consolidator } from './consolidator.js';
export type {
  ConsolidatorOptions,
  LogActionOptions,
  SessionTranscript,
  TranscriptMessage,
} from './consolidator.js';

// ─── Synthesizer (lesson extraction) ─────────────────────────────────────────
export { Synthesizer } from './synthesizer.js';
export type {
  Lesson,
  LessonCategory,
  SynthesisResult,
  SynthesizerOptions,
} from './synthesizer.js';

// ─── Storage (search + persistence) ──────────────────────────────────────────
export { MeridianStorage, JsonStore, MarkdownStore } from './storage.js';
export type {
  JsonRecord,
  MarkdownEntry,
  MemorySnippet,
  SearchResult,
  StorageOptions,
} from './storage.js';

// ─── Engine (low-level consolidation) ────────────────────────────────────────
export { MeridianEngine } from './engine.js';
export type { ConsolidationResult, MeridianEngineOptions } from './engine.js';

export {
  TimeGate,
  SessionGate,
  LockGate,
  GateCoordinator,
} from './gates.js';
export type {
  TimeGateResult,
  SessionGateResult,
  LockGateResult,
  GateCheckResult,
} from './gates.js';

export { MemoryStore, MemoryStoreError } from './memory-store.js';
export type { MemoryFrontmatter } from './memory-store.js';

export {
  gatherFromDailyLogs,
  gatherFromDriftedMemories,
  gatherFromTranscripts,
  prioritizeSignals,
  createSignalOptions,
} from './signal.js';
export type { SignalGatherOptions } from './signal.js';
