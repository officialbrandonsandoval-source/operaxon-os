export interface ComplexTask {
  id: string;
  description: string;
  requestedBy: string;
  priority: number;
  researchTasks: ResearchTask[];
  deadline?: string; // ISO 8601
}

export interface ResearchTask {
  id: string;
  query: string;
  sources: string[];
  assignedAgent?: string;
}

export interface SynthesisResult {
  findings: Finding[];
  tasks: ImplementationTask[];
  risks: string[];
}

export interface Finding {
  source: string;
  content: string;
  confidence: number; // 0-1
  relevance: number; // 0-1
}

export interface ImplementationTask {
  id: string;
  description: string;
  dependencies: string[];
  assignedAgent?: string;
  estimatedMs?: number;
}

export interface CoordinationResult {
  taskId: string;
  status: "completed" | "partial" | "failed";
  phases: PhaseResult[];
  duration: number; // ms
}

export interface PhaseResult {
  phase: "research" | "synthesis" | "implementation" | "verification";
  status: "completed" | "failed";
  outputs: unknown[];
  errors: string[];
  durationMs: number;
}

export interface WorkerResult {
  workerId: string;
  taskId: string;
  status: "completed" | "failed";
  output: unknown;
  error?: string;
  durationMs: number;
}
