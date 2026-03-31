// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * Permissions — RBAC (Role-Based Access Control) for the Operaxon OS.
 *
 * Who can invoke what. Enforced by the Governor on every action.
 *
 * Permission model:
 * - Each agent has a role (governor, builder, trader, etc.)
 * - Roles have default permissions
 * - Agents can be granted additional permissions
 * - Permissions can require principal approval
 * - Destructive operations always require sovereign approval
 */

import { AgentIdentity, type AgentRole } from './identity.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Permission {
  action: string;           // e.g. 'code:write', 'deploy:production'
  roles: AgentRole[];       // which roles have this permission
  requiresApproval?: boolean;
  approvalLevel?: 'operator' | 'sovereign';
  description: string;
}

export interface PermissionCheckResult {
  allowed: boolean;
  requiresApproval: boolean;
  approvalLevel: 'operator' | 'sovereign' | null;
  reason: string;
}

export interface ActionContext {
  agentId: string;
  action: string;
  capability?: string;
  riskLevel?: number; // 0-10
}

// ---------------------------------------------------------------------------
// Permission table — the source of truth for what each role can do
// ---------------------------------------------------------------------------

/** Built-in permission rules for the Operaxon OS */
const PERMISSION_TABLE: Permission[] = [
  // ─── Universal (all roles) ────────────────────────────────────────────
  {
    action: 'memory:read:own',
    roles: ['governor', 'builder', 'trader', 'communicator', 'researcher', 'salesperson', 'legal', 'analyst', 'worker'],
    description: 'Read own agent memory',
  },
  {
    action: 'memory:write:own',
    roles: ['governor', 'builder', 'trader', 'communicator', 'researcher', 'salesperson', 'legal', 'analyst', 'worker'],
    description: 'Write own agent memory',
  },
  {
    action: 'log:write',
    roles: ['governor', 'builder', 'trader', 'communicator', 'researcher', 'salesperson', 'legal', 'analyst', 'worker'],
    description: 'Write to daily log',
  },
  {
    action: 'message:send',
    roles: ['governor', 'builder', 'trader', 'communicator', 'researcher', 'salesperson', 'legal', 'analyst', 'worker'],
    description: 'Send messages within the civilization',
  },

  // ─── Governor only ────────────────────────────────────────────────────
  {
    action: 'memory:read:any',
    roles: ['governor'],
    description: 'Read any agent\'s memory',
  },
  {
    action: 'memory:write:any',
    roles: ['governor'],
    requiresApproval: true,
    approvalLevel: 'operator',
    description: 'Modify any agent\'s memory',
  },
  {
    action: 'agent:spawn',
    roles: ['governor'],
    requiresApproval: true,
    approvalLevel: 'operator',
    description: 'Spawn a new agent',
  },
  {
    action: 'agent:suspend',
    roles: ['governor'],
    requiresApproval: true,
    approvalLevel: 'operator',
    description: 'Suspend an agent',
  },
  {
    action: 'agent:revoke',
    roles: ['governor'],
    requiresApproval: true,
    approvalLevel: 'sovereign',
    description: 'Permanently revoke an agent',
  },
  {
    action: 'consolidation:run',
    roles: ['governor'],
    description: 'Run memory consolidation',
  },

  // ─── Builder (Praxis) ─────────────────────────────────────────────────
  {
    action: 'code:read',
    roles: ['builder', 'governor'],
    description: 'Read source code',
  },
  {
    action: 'code:write',
    roles: ['builder', 'governor'],
    description: 'Write source code',
  },
  {
    action: 'deploy:staging',
    roles: ['builder', 'governor'],
    description: 'Deploy to staging environment',
  },
  {
    action: 'deploy:production',
    roles: ['builder', 'governor'],
    requiresApproval: true,
    approvalLevel: 'operator',
    description: 'Deploy to production',
  },
  {
    action: 'git:commit',
    roles: ['builder', 'governor'],
    description: 'Commit to git repository',
  },
  {
    action: 'git:push',
    roles: ['builder', 'governor'],
    description: 'Push to remote git repository',
  },
  {
    action: 'shell:exec',
    roles: ['builder', 'governor'],
    description: 'Execute shell commands',
  },
  {
    action: 'file:delete',
    roles: ['builder', 'governor'],
    requiresApproval: true,
    approvalLevel: 'operator',
    description: 'Delete files',
  },

  // ─── Trader (Aurum) ───────────────────────────────────────────────────
  {
    action: 'market:read',
    roles: ['trader', 'governor'],
    description: 'Read market data',
  },
  {
    action: 'trade:signal',
    roles: ['trader', 'governor'],
    description: 'Generate trade signals',
  },
  {
    action: 'trade:execute',
    roles: ['trader', 'governor'],
    requiresApproval: true,
    approvalLevel: 'sovereign',
    description: 'Execute a trade',
  },

  // ─── Communicator (Hermes) ────────────────────────────────────────────
  {
    action: 'content:draft',
    roles: ['communicator', 'governor'],
    description: 'Draft content for publishing',
  },
  {
    action: 'publish:queue',
    roles: ['communicator', 'governor'],
    description: 'Add to publish queue',
  },
  {
    action: 'publish:external',
    roles: ['communicator', 'governor'],
    requiresApproval: true,
    approvalLevel: 'operator',
    description: 'Publish externally (Twitter, etc.)',
  },

  // ─── Researcher (Sophia) ──────────────────────────────────────────────
  {
    action: 'web:search',
    roles: ['researcher', 'analyst', 'governor'],
    description: 'Search the web',
  },
  {
    action: 'web:fetch',
    roles: ['researcher', 'analyst', 'governor'],
    description: 'Fetch web content',
  },
  {
    action: 'data:analyze',
    roles: ['researcher', 'analyst', 'trader', 'governor'],
    description: 'Analyze data',
  },
  {
    action: 'report:write',
    roles: ['researcher', 'analyst', 'governor'],
    description: 'Write reports',
  },

  // ─── Legal (Lex) ──────────────────────────────────────────────────────
  {
    action: 'contract:draft',
    roles: ['legal', 'governor'],
    description: 'Draft contracts',
  },
  {
    action: 'contract:sign',
    roles: ['legal', 'governor'],
    requiresApproval: true,
    approvalLevel: 'sovereign',
    description: 'Sign contracts',
  },

  // ─── Escalation triggers (any role, but require approval) ─────────────
  {
    action: 'delete:database',
    roles: ['governor'],
    requiresApproval: true,
    approvalLevel: 'sovereign',
    description: 'Delete database (irreversible)',
  },
  {
    action: 'payment:process',
    roles: ['governor'],
    requiresApproval: true,
    approvalLevel: 'sovereign',
    description: 'Process a payment',
  },
];

// ---------------------------------------------------------------------------
// PermissionEngine
// ---------------------------------------------------------------------------

export class PermissionEngine {
  private readonly rules: Permission[];
  private readonly grantCache: Map<string, Set<string>> = new Map(); // agentId -> granted actions

  constructor(customRules: Permission[] = []) {
    this.rules = [...PERMISSION_TABLE, ...customRules];
  }

  // -----------------------------------------------------------------------
  // Primary check
  // -----------------------------------------------------------------------

  /**
   * Check if an agent identity is allowed to perform an action.
   * Enforces both role-based and capability-based rules.
   */
  check(identity: AgentIdentity, context: ActionContext): PermissionCheckResult {
    // Governor can do anything — always permitted
    if (identity.isGovernor) {
      return {
        allowed: true,
        requiresApproval: false,
        approvalLevel: null,
        reason: 'Governor role has universal access',
      };
    }

    // Check high-risk actions (risk level >= 8 always requires sovereign approval)
    if ((context.riskLevel ?? 0) >= 8) {
      return {
        allowed: false,
        requiresApproval: true,
        approvalLevel: 'sovereign',
        reason: `Risk level ${context.riskLevel} requires sovereign approval`,
      };
    }

    // Check if the identity has the required capability
    if (context.capability && !identity.hasCapability(context.capability)) {
      return {
        allowed: false,
        requiresApproval: false,
        approvalLevel: null,
        reason: `Agent ${identity.id} lacks capability: ${context.capability}`,
      };
    }

    // Check if agent's own limits require approval for this action
    if (identity.requiresApproval(context.action)) {
      return {
        allowed: false,
        requiresApproval: true,
        approvalLevel: 'operator',
        reason: `Action "${context.action}" requires approval per agent limits`,
      };
    }

    // Check permission table
    const matchingRule = this.findRule(context.action, identity.role);

    if (matchingRule === null) {
      return {
        allowed: false,
        requiresApproval: false,
        approvalLevel: null,
        reason: `No permission rule for action "${context.action}" and role "${identity.role}"`,
      };
    }

    if (matchingRule.requiresApproval === true) {
      return {
        allowed: false,
        requiresApproval: true,
        approvalLevel: matchingRule.approvalLevel ?? 'operator',
        reason: `Action "${context.action}" requires ${matchingRule.approvalLevel ?? 'operator'} approval`,
      };
    }

    // Check extra grants (dynamically granted permissions)
    const grants = this.grantCache.get(identity.id);
    if (grants?.has(context.action)) {
      return {
        allowed: true,
        requiresApproval: false,
        approvalLevel: null,
        reason: `Action "${context.action}" granted to agent ${identity.id}`,
      };
    }

    return {
      allowed: true,
      requiresApproval: false,
      approvalLevel: null,
      reason: `Action "${context.action}" permitted for role "${identity.role}"`,
    };
  }

  // -----------------------------------------------------------------------
  // Dynamic grants
  // -----------------------------------------------------------------------

  /**
   * Grant a specific action to an agent (beyond their role defaults).
   * These are runtime grants — not persisted across restarts.
   */
  grant(agentId: string, action: string): void {
    const grants = this.grantCache.get(agentId) ?? new Set<string>();
    grants.add(action);
    this.grantCache.set(agentId, grants);
  }

  /**
   * Revoke a previously granted action.
   */
  revoke(agentId: string, action: string): void {
    this.grantCache.get(agentId)?.delete(action);
  }

  /**
   * List all permissions available to a given role.
   */
  listForRole(role: AgentRole): Permission[] {
    return this.rules.filter(r => r.roles.includes(role));
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private findRule(action: string, role: AgentRole): Permission | null {
    // Exact match first
    for (const rule of this.rules) {
      if (rule.action === action && rule.roles.includes(role)) {
        return rule;
      }
    }

    // Prefix wildcard match (e.g. rule 'code:*' matches 'code:write')
    for (const rule of this.rules) {
      if (rule.action.endsWith(':*')) {
        const prefix = rule.action.slice(0, -1);
        if (action.startsWith(prefix) && rule.roles.includes(role)) {
          return rule;
        }
      }
    }

    return null;
  }
}
