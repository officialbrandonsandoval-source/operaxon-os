export interface OperaxonConfig {
  governor: GovernorConfig;
  agents: AgentConfig[];
  channels: ChannelConfig[];
  runtime: RuntimeConfig;
}

export interface GovernorConfig {
  name: string;
  model: string;
  memory: MemoryConfig;
  principals: Principal[];
}

export interface Principal {
  id: string;
  name: string;
  contact: string; // e.g. "telegram:8570412390"
  authority: AuthorityLevel;
}

export type AuthorityLevel = "sovereign" | "operator" | "viewer";

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  model: string;
  domains: string[];
  tools: string[];
  memory: "shared" | "isolated";
  containment: ContainmentPolicy;
}

export interface ContainmentPolicy {
  allowedTools: string[];
  deniedTools: string[];
  maxConcurrentActions: number;
  requiresApproval: string[]; // action patterns requiring principal approval
  clearanceLevel: number; // 0-10, higher = more access
}

export interface ChannelConfig {
  id: string;
  type: ChannelType;
  enabled: boolean;
  credentials: string; // reference to keychain entry, NEVER the actual secret
  options: Record<string, string>;
}

export type ChannelType = "telegram" | "discord" | "signal" | "slack" | "webhook";

export interface RuntimeConfig {
  port: number;
  host: string;
  logLevel: LogLevel;
  rateLimiting: RateLimitConfig;
  cors: CorsConfig;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface CorsConfig {
  allowedOrigins: string[];
  allowedMethods: string[];
}

export interface MemoryConfig {
  storagePath: string;
  encryptionKeyRef: string; // reference to OS keychain entry
  maxMemoryLines: number; // default 200
  consolidationInterval: number; // hours between meridian cycles
  minSessionsBeforeConsolidation: number; // minimum sessions before consolidation
}
