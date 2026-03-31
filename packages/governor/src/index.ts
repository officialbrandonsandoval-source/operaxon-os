// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

// ─── Primary governance ──────────────────────────────────────────────────────
export { Governor } from './governor.js';
export type { GovernorState, GovernorSession, RouteResult } from './governor.js';

// ─── Identity layer ───────────────────────────────────────────────────────────
export {
  AgentIdentity,
  IdentityRegistry,
  CIVILIZATION_AGENTS,
} from './identity.js';
export type {
  AgentIdentityConfig,
  AgentRole,
  AgentLimits,
  AgentStatus,
} from './identity.js';

// ─── Permissions (RBAC) ──────────────────────────────────────────────────────
export { PermissionEngine } from './permissions.js';
export type {
  Permission,
  PermissionCheckResult,
  ActionContext,
} from './permissions.js';

// ─── Signer (decision verification) ──────────────────────────────────────────
export { AgentSigner } from './signer.js';
export type {
  AgentDecision,
  SignedDecision,
  VerificationResult,
  AgentToken,
} from './signer.js';

// ─── Principal hierarchy ──────────────────────────────────────────────────────
export { PrincipalRegistry } from './principals.js';
export type { PrincipalRecord, AuthorityQuery } from './principals.js';

// ─── Chain of command ─────────────────────────────────────────────────────────
export { ChainOfCommand } from './chain-of-command.js';
export type { ChainLink, ActionRequest, EscalationResult, ApproverResult } from './chain-of-command.js';

// ─── Configuration ────────────────────────────────────────────────────────────
export { loadConfig, validateConfig, getDefaults } from './config.js';
export type { ConfigValidationResult, ConfigSecurityIssue } from './config.js';
