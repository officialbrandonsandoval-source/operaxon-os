// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * Identity — agent profiles with name, role, capabilities, and limits.
 *
 * Every agent in the Operaxon OS has an AgentIdentity. The identity is
 * the source of truth for what an agent is, what it can do, and what
 * it cannot do. The Governor uses identities to enforce permissions.
 */

import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentIdentityConfig {
  id: string;
  name: string;
  role: AgentRole;
  capabilities: string[]; // ['*'] for full access, or specific capability names
  limits: AgentLimits;
  description?: string;
  model?: string;
}

export type AgentRole =
  | 'governor'    // Root — can do anything
  | 'builder'     // Code, deploy, git operations
  | 'trader'      // Market trading, portfolio management
  | 'communicator' // Publishing, messaging, social media
  | 'researcher'  // Information gathering, analysis
  | 'salesperson' // Outreach, CRM, prospecting
  | 'legal'       // Contracts, compliance, IP
  | 'analyst'     // Data analysis, reporting
  | 'worker';     // Generic worker (default)

export interface AgentLimits {
  maxConcurrentTasks: number;
  maxActionsPerMinute: number;
  maxMemoryMb?: number;
  canSpawnAgents?: boolean;
  canModifyMemory?: boolean;
  canAccessOtherAgentMemory?: boolean;
  canMakeExternalCalls?: boolean;
  requiresApprovalFor?: string[]; // action patterns
}

export type AgentStatus = 'active' | 'suspended' | 'revoked';

// ---------------------------------------------------------------------------
// Pre-built Identities — the Civilization agents
// ---------------------------------------------------------------------------

/** All pre-built agent identities for the Operaxon civilization */
export const CIVILIZATION_AGENTS: Record<string, AgentIdentityConfig> = {
  Dominus: {
    id: 'agt-000',
    name: 'Dominus Sui',
    role: 'governor',
    description: 'Governing Intelligence — root node of the civilization',
    capabilities: ['*'], // Can do anything
    model: 'claude-opus-4-20250514',
    limits: {
      maxConcurrentTasks: 10,
      maxActionsPerMinute: 1000,
      canSpawnAgents: true,
      canModifyMemory: true,
      canAccessOtherAgentMemory: true,
      canMakeExternalCalls: true,
    },
  },
  Praxis: {
    id: 'agt-001',
    name: 'Praxis',
    role: 'builder',
    description: 'Builder & Executor — heavy compute, code, rendering',
    capabilities: ['code', 'deploy', 'git', 'shell', 'file:read', 'file:write'],
    model: 'claude-sonnet-4-20250514',
    limits: {
      maxConcurrentTasks: 3,
      maxActionsPerMinute: 60,
      canSpawnAgents: false,
      canModifyMemory: true,
      canAccessOtherAgentMemory: false,
      canMakeExternalCalls: true,
      requiresApprovalFor: ['deploy:production', 'delete:*', 'rm:*'],
    },
  },
  Aurum: {
    id: 'agt-002',
    name: 'Aurum',
    role: 'trader',
    description: 'Trading Intelligence — Kalshi, Polymarket, crypto prediction markets',
    capabilities: ['trade:read', 'trade:signal', 'market:read', 'portfolio:read'],
    model: 'claude-sonnet-4-20250514',
    limits: {
      maxConcurrentTasks: 2,
      maxActionsPerMinute: 60,
      canSpawnAgents: false,
      canModifyMemory: true,
      canAccessOtherAgentMemory: false,
      canMakeExternalCalls: true,
      requiresApprovalFor: ['trade:execute', 'withdraw:*', 'deposit:*'],
    },
  },
  Hermes: {
    id: 'agt-003',
    name: 'Hermes',
    role: 'communicator',
    description: 'Communications & publishing — Twitter API, content distribution',
    capabilities: ['publish:twitter', 'publish:discord', 'message:send', 'content:schedule'],
    model: 'claude-sonnet-4-20250514',
    limits: {
      maxConcurrentTasks: 5,
      maxActionsPerMinute: 30,
      canSpawnAgents: false,
      canModifyMemory: true,
      canAccessOtherAgentMemory: false,
      canMakeExternalCalls: true,
      requiresApprovalFor: ['publish:external', 'email:send'],
    },
  },
  Legatus: {
    id: 'agt-004',
    name: 'Legatus',
    role: 'salesperson',
    description: 'Outreach & sales — Operaxon pipeline, prospecting',
    capabilities: ['crm:read', 'crm:write', 'email:draft', 'outreach:send'],
    model: 'claude-sonnet-4-20250514',
    limits: {
      maxConcurrentTasks: 3,
      maxActionsPerMinute: 20,
      canSpawnAgents: false,
      canModifyMemory: true,
      canAccessOtherAgentMemory: false,
      canMakeExternalCalls: true,
      requiresApprovalFor: ['contract:sign', 'payment:process'],
    },
  },
  Sophia: {
    id: 'agt-005',
    name: 'Sophia',
    role: 'researcher',
    description: 'Research & intelligence — market research, competitive analysis',
    capabilities: ['web:search', 'web:fetch', 'data:analyze', 'report:write'],
    model: 'claude-sonnet-4-20250514',
    limits: {
      maxConcurrentTasks: 3,
      maxActionsPerMinute: 60,
      canSpawnAgents: false,
      canModifyMemory: true,
      canAccessOtherAgentMemory: false,
      canMakeExternalCalls: true,
    },
  },
  Lex: {
    id: 'agt-006',
    name: 'Lex',
    role: 'legal',
    description: 'Legal & IP protection — contracts, trademarks, compliance',
    capabilities: ['legal:read', 'legal:draft', 'contract:draft', 'compliance:check'],
    model: 'claude-opus-4-20250514',
    limits: {
      maxConcurrentTasks: 2,
      maxActionsPerMinute: 20,
      canSpawnAgents: false,
      canModifyMemory: true,
      canAccessOtherAgentMemory: false,
      canMakeExternalCalls: false,
      requiresApprovalFor: ['contract:sign', 'trademark:file', 'legal:file'],
    },
  },
};

// ---------------------------------------------------------------------------
// AgentIdentity — the identity object
// ---------------------------------------------------------------------------

export class AgentIdentity {
  readonly id: string;
  readonly name: string;
  readonly role: AgentRole;
  readonly capabilities: ReadonlySet<string>;
  readonly limits: Readonly<AgentLimits>;
  readonly description: string;
  readonly model: string;
  readonly createdAt: string;
  private _status: AgentStatus = 'active';

  constructor(config: AgentIdentityConfig) {
    if (!config.id || !config.name || !config.role) {
      throw new Error('AgentIdentity requires id, name, and role');
    }

    this.id = config.id;
    this.name = config.name;
    this.role = config.role;
    this.capabilities = new Set(config.capabilities);
    this.limits = Object.freeze({ ...config.limits });
    this.description = config.description ?? '';
    this.model = config.model ?? 'claude-sonnet-4-20250514';
    this.createdAt = new Date().toISOString();
  }

  // -----------------------------------------------------------------------
  // Capability checks
  // -----------------------------------------------------------------------

  /**
   * Check if this agent has a specific capability.
   * Wildcard '*' grants all capabilities.
   */
  hasCapability(capability: string): boolean {
    if (this.capabilities.has('*')) return true;
    if (this.capabilities.has(capability)) return true;

    // Check prefix wildcards (e.g. 'file:*' matches 'file:read')
    for (const cap of this.capabilities) {
      if (cap.endsWith(':*')) {
        const prefix = cap.slice(0, -1); // 'file:'
        if (capability.startsWith(prefix)) return true;
      }
    }

    return false;
  }

  /**
   * Check if an action requires approval from a principal.
   */
  requiresApproval(action: string): boolean {
    const patterns = this.limits.requiresApprovalFor ?? [];
    return patterns.some(pattern => {
      if (pattern.endsWith(':*')) {
        return action.startsWith(pattern.slice(0, -1));
      }
      if (pattern.endsWith('*')) {
        return action.startsWith(pattern.slice(0, -1));
      }
      return action === pattern;
    });
  }

  /**
   * True if the governor role — can do anything.
   */
  get isGovernor(): boolean {
    return this.role === 'governor';
  }

  /**
   * True if the agent can spawn sub-agents.
   */
  get canSpawn(): boolean {
    return this.limits.canSpawnAgents === true || this.isGovernor;
  }

  get status(): AgentStatus {
    return this._status;
  }

  suspend(): void {
    this._status = 'suspended';
  }

  activate(): void {
    this._status = 'active';
  }

  revoke(): void {
    this._status = 'revoked';
  }

  /**
   * Serialize to a plain object for storage / transport.
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      capabilities: Array.from(this.capabilities),
      limits: this.limits,
      description: this.description,
      model: this.model,
      createdAt: this.createdAt,
      status: this._status,
    };
  }
}

// ---------------------------------------------------------------------------
// IdentityRegistry — manages all agent identities
// ---------------------------------------------------------------------------

export class IdentityRegistry {
  private readonly identities: Map<string, AgentIdentity> = new Map();

  /**
   * Register an agent identity.
   */
  register(config: AgentIdentityConfig): AgentIdentity {
    if (this.identities.has(config.id)) {
      throw new Error(`Identity already registered: ${config.id}`);
    }
    const identity = new AgentIdentity(config);
    this.identities.set(config.id, identity);
    return identity;
  }

  /**
   * Get an identity by agent ID.
   */
  get(agentId: string): AgentIdentity | undefined {
    return this.identities.get(agentId);
  }

  /**
   * Get all identities.
   */
  list(): readonly AgentIdentity[] {
    return Array.from(this.identities.values());
  }

  /**
   * Get all identities with a given role.
   */
  byRole(role: AgentRole): readonly AgentIdentity[] {
    return this.list().filter(id => id.role === role);
  }

  /**
   * Load the pre-built civilization agents.
   */
  loadCivilization(): void {
    for (const config of Object.values(CIVILIZATION_AGENTS)) {
      if (!this.identities.has(config.id)) {
        this.register(config);
      }
    }
  }

  /**
   * Check if an agent exists and is active.
   */
  isActive(agentId: string): boolean {
    return this.get(agentId)?.status === 'active';
  }

  /**
   * Create a unique identity token (for verifying agent messages).
   */
  createToken(agentId: string): string {
    const identity = this.get(agentId);
    if (!identity) throw new Error(`Unknown agent: ${agentId}`);
    return `${agentId}:${randomUUID()}:${Date.now()}`;
  }
}
