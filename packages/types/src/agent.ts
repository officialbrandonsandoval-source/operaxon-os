export interface AgentIdentity {
  id: string;
  name: string;
  role: string;
  model: string;
  createdAt: string; // ISO 8601
}

export interface AgentState {
  identity: AgentIdentity;
  status: AgentStatus;
  currentTask: string | null;
  lastActive: string; // ISO 8601
  metrics: AgentMetrics;
}

export type AgentStatus = "idle" | "active" | "consolidating" | "suspended" | "error";

export interface AgentMetrics {
  tasksCompleted: number;
  tasksFailed: number;
  avgResponseMs: number;
  uptime: number; // seconds
}

export interface AgentMessage {
  id: string;
  from: string; // agent id
  to: string; // agent id or "governor"
  type: MessageType;
  payload: unknown;
  timestamp: string; // ISO 8601
}

export type MessageType = "task" | "result" | "error" | "status" | "approval_request" | "approval_response";
