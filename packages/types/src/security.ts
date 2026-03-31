export interface AuditEntry {
  id: string;
  timestamp: string; // ISO 8601
  agent: string;
  action: string;
  tool?: string;
  approvedBy?: string;
  outcome: AuditOutcome;
  metadata: Record<string, unknown>;
  signature: string; // HMAC signature for integrity
}

export type AuditOutcome = "success" | "failure" | "denied" | "pending_approval";

export interface EncryptionConfig {
  algorithm: "aes-256-gcm";
  keyRef: string; // OS keychain reference
  ivLength: number;
  tagLength: number;
}

export interface SSRFPolicy {
  allowedHosts: string[];
  deniedCIDRs: string[]; // private networks blocked by default
  maxRedirects: number;
}

export interface ToolAllowlist {
  agentId: string;
  allowed: string[];
  denied: string[];
}
