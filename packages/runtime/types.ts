export interface OperaxonConfig {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  agentName: string;
  agentId: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  channels: ChannelConfig;
  sessions: SessionConfig;
  mcp?: MCPConfig;
}

export interface ChannelConfig {
  telegram?: {
    botToken: string;
  };
  discord?: {
    botToken: string;
  };
  signal?: {
    apiUrl: string;
  };
}

export interface SessionConfig {
  secret: string;
  ttlSeconds: number;
}

export interface MCPConfig {
  serverUrl: string;
}

export interface AgentMessage {
  id: string;
  sessionId: string;
  channel: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface AgentSession {
  id: string;
  agentId: string;
  userId?: string;
  channel: string;
  messages: AgentMessage[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
  services: Record<string, 'up' | 'down' | 'unknown'>;
}
