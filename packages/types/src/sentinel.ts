export interface SentinelConfig {
  tickIntervalMs: number;
  blockingBudgetMs: number;
  proactiveChecks: ProactiveChecks;
  silentHours: SilentHoursConfig;
}

export interface ProactiveChecks {
  email: boolean;
  calendar: boolean;
  agentCompletions: boolean;
  systemHealth: boolean;
  revenueMetrics: boolean;
}

export interface SilentHoursConfig {
  enabled: boolean;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  timezone: string;
}

export interface TickContext {
  timestamp: string;
  civilizationState: CivilizationState;
  pendingTasks: number;
  unreadMessages: number;
  agentStatuses: Record<string, string>;
}

export interface CivilizationState {
  name: string;
  uptime: number;
  activeAgents: number;
  totalTasks: number;
  health: HealthStatus;
}

export type HealthStatus = "healthy" | "degraded" | "critical";

export interface Assessment {
  shouldAct: boolean;
  priority: number; // 0-10
  reason: string;
  suggestedAction?: PlannedAction;
}

export interface PlannedAction {
  type: string;
  description: string;
  estimatedMs: number;
  requiresApproval: boolean;
  targetAgent?: string;
}
