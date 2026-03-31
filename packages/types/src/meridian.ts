export interface MeridianConfig {
  timeGateHours: number; // hours since last consolidation
  sessionGateCount: number; // sessions since last consolidation
  maxMemoryLines: number;
  maxMemoryBytes: number;
  storagePath: string;
  encryptionKeyRef: string;
}

export interface MeridianState {
  lastConsolidation: string | null; // ISO 8601
  sessionsSinceLastConsolidation: number;
  isLocked: boolean;
  lockHolder: string | null;
  lockAcquiredAt: string | null;
}

export interface MeridianPhase {
  name: "orient" | "gather" | "consolidate" | "prune";
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  name: string;
  description: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  filePath: string;
}

export type MemoryType = "user" | "feedback" | "project" | "reference" | "business" | "decision" | "person";

export interface ConsolidationSignal {
  source: SignalSource;
  content: string;
  relevance: number; // 0-1
  timestamp: string;
}

export type SignalSource = "daily_log" | "drifted_memory" | "transcript" | "agent_report";
