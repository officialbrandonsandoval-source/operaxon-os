// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

import type {
  OperaxonConfig,
  AgentConfig,
  AgentMessage,
  MessageType,
  AuthorityLevel,
} from '@operaxon/types';
import { AuditLog } from '@operaxon/security';
import { PrincipalRegistry } from './principals.js';
import { ChainOfCommand } from './chain-of-command.js';
import type { ActionRequest } from './chain-of-command.js';
import { validateConfig } from './config.js';

// ─── Public types ────────────────────────────────────────────────────────────

/**
 * Snapshot of the Governor's current operational state.
 */
export interface GovernorState {
  initialized: boolean;
  governorId: string;
  civilizationName: string;
  activeAgents: readonly string[];
  activeSessions: readonly string[];
  uptimeMs: number;
}

/**
 * An active session between a principal and the Governor.
 */
export interface GovernorSession {
  sessionId: string;
  principalId: string;
  startedAt: string;
  lastMessageAt: string;
  messageCount: number;
}

/**
 * Result of routing a message to an agent.
 */
export interface RouteResult {
  routed: boolean;
  targetAgentId: string | null;
  reason: string;
}

// ─── Governor ────────────────────────────────────────────────────────────────

/**
 * Governor — the root node of every Operaxon civilization.
 *
 * Responsibilities:
 *  - Holds the full business context (config, agent roster, principal hierarchy)
 *  - Manages principal hierarchy via PrincipalRegistry
 *  - Routes incoming messages/sessions to appropriate agents based on domain
 *  - Enforces chain of command — agents report to governor, governor reports to principals
 *  - Provides the audit trail for all actions passing through the chain
 */
export class Governor {
  private readonly governorId: string;
  private readonly principals: PrincipalRegistry;
  private readonly chain: ChainOfCommand;
  private readonly agentConfigs: Map<string, AgentConfig> = new Map();
  private readonly domainIndex: Map<string, string[]> = new Map(); // domain -> agent ids
  private readonly sessions: Map<string, GovernorSession> = new Map();
  private auditLog: AuditLog | null = null;

  private config: OperaxonConfig | null = null;
  private initialized = false;
  private startedAt: number = 0;

  constructor() {
    this.governorId = `governor-${crypto.randomUUID()}`;
    this.principals = new PrincipalRegistry();
    this.chain = new ChainOfCommand(this.governorId, this.principals);
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  /**
   * Initialize the Governor with a validated configuration.
   *
   * This registers all principals, builds the agent roster, constructs the
   * domain index for message routing, and sets up the audit log.
   *
   * Throws if config is invalid or initialization fails.
   */
  initialize(config: OperaxonConfig, auditSigningKey: Buffer): void {
    if (this.initialized) {
      throw new Error('Governor is already initialized. Create a new instance to re-initialize.');
    }

    // Validate the config before accepting it
    const validation = validateConfig(config);
    if (!validation.valid) {
      const messages = [
        ...validation.errors,
        ...validation.securityIssues
          .filter((s) => s.severity === 'critical')
          .map((s) => `SECURITY: ${s.field} — ${s.message}`),
      ];
      throw new Error(`Cannot initialize with invalid config:\n  ${messages.join('\n  ')}`);
    }

    this.config = config;

    // Register principals
    for (const principal of config.governor.principals) {
      this.principals.register(principal);
    }

    // Register agents and build domain index
    for (const agentConfig of config.agents) {
      this.registerAgent(agentConfig);
    }

    // Refresh chain now that principals are loaded
    this.chain.refreshPrincipalLinks();

    // Set up audit log
    this.auditLog = new AuditLog(config.governor.memory.storagePath, auditSigningKey);

    this.startedAt = Date.now();
    this.initialized = true;
  }

  /**
   * Get the current state of the Governor.
   */
  getState(): GovernorState {
    return {
      initialized: this.initialized,
      governorId: this.governorId,
      civilizationName: this.config?.governor.name ?? '(not initialized)',
      activeAgents: Array.from(this.agentConfigs.keys()),
      activeSessions: Array.from(this.sessions.keys()),
      uptimeMs: this.initialized ? Date.now() - this.startedAt : 0,
    };
  }

  // ─── Message routing ─────────────────────────────────────────────────────

  /**
   * Route an incoming message to the appropriate agent based on domain matching.
   *
   * Routing logic:
   *  1. If the message has an explicit `to` field targeting an agent, route directly
   *  2. If the message payload contains domain hints, find the best matching agent
   *  3. If no domain match, return unrouted with a reason
   *
   * All routing decisions are audited.
   */
  async routeMessage(message: AgentMessage, domain: string | null): Promise<RouteResult> {
    this.assertInitialized();

    // Direct routing: message explicitly targets an agent
    if (message.to !== 'governor' && this.agentConfigs.has(message.to)) {
      await this.auditRouting(message, message.to, 'direct');
      return {
        routed: true,
        targetAgentId: message.to,
        reason: `Message directly addressed to agent ${message.to}`,
      };
    }

    // Domain-based routing
    if (domain !== null) {
      const agentId = this.getAgentForDomain(domain);
      if (agentId !== null) {
        await this.auditRouting(message, agentId, 'domain');
        return {
          routed: true,
          targetAgentId: agentId,
          reason: `Routed to agent ${agentId} via domain "${domain}"`,
        };
      }
    }

    // No route found
    await this.auditRouting(message, null, 'unrouted');
    return {
      routed: false,
      targetAgentId: null,
      reason: domain !== null
        ? `No agent registered for domain "${domain}"`
        : 'No domain specified and message not addressed to a specific agent',
    };
  }

  /**
   * Find the best agent for a given domain.
   *
   * Returns the first agent whose domains list contains the given domain.
   * Returns null if no agent handles that domain.
   */
  getAgentForDomain(domain: string): string | null {
    this.assertInitialized();

    const agentIds = this.domainIndex.get(domain);
    if (!agentIds || agentIds.length === 0) {
      return null;
    }

    // Return the first matching agent. In the future this could use
    // load balancing or priority-based selection.
    const firstId = agentIds[0];
    return firstId ?? null;
  }

  // ─── Chain of command ────────────────────────────────────────────────────

  /**
   * Enforce chain of command for an agent action.
   *
   * Validates the action against the agent's containment policy and the
   * chain of command hierarchy. If the action requires escalation, it
   * returns the escalation target.
   *
   * This is the primary control point — every agent action should pass
   * through here before execution.
   */
  async enforceChainOfCommand(request: ActionRequest): Promise<ChainOfCommandResult> {
    this.assertInitialized();

    const validation = this.chain.validateAction(request);

    if (validation.allowed) {
      await this.auditAction(request, 'allowed');
      return {
        permitted: true,
        escalatedTo: null,
        reason: validation.reason,
      };
    }

    if (validation.requiresEscalation) {
      // Determine required authority based on risk level
      const requiredAuthority = this.riskToAuthority(request.estimatedRiskLevel);
      const escalation = this.chain.escalate(
        request.agentId,
        request.action,
        requiredAuthority,
      );

      await this.auditAction(request, 'escalated');

      return {
        permitted: false,
        escalatedTo: escalation.escalatedTo,
        reason: `${validation.reason}. ${escalation.reason}`,
      };
    }

    // Denied outright — no escalation possible
    await this.auditAction(request, 'denied');
    return {
      permitted: false,
      escalatedTo: null,
      reason: validation.reason,
    };
  }

  // ─── Sessions ────────────────────────────────────────────────────────────

  /**
   * Start a new session for a principal.
   * Validates the principal exists and has at least viewer authority.
   */
  startSession(principalId: string): GovernorSession {
    this.assertInitialized();

    if (!this.principals.canView(principalId)) {
      throw new Error(`Principal ${principalId} does not have permission to start a session`);
    }

    const session: GovernorSession = {
      sessionId: `session-${crypto.randomUUID()}`,
      principalId,
      startedAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
      messageCount: 0,
    };

    this.sessions.set(session.sessionId, session);
    this.principals.touch(principalId);

    return session;
  }

  /**
   * End an active session.
   */
  endSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Get an active session by id.
   */
  getSession(sessionId: string): GovernorSession | undefined {
    return this.sessions.get(sessionId);
  }

  // ─── Principal access ────────────────────────────────────────────────────

  /**
   * Get the principal registry (read-only operations are safe; mutations
   * should go through Governor methods that enforce chain of command).
   */
  getPrincipalRegistry(): PrincipalRegistry {
    return this.principals;
  }

  /**
   * Get the chain of command instance.
   */
  getChainOfCommand(): ChainOfCommand {
    return this.chain;
  }

  // ─── Agent management ────────────────────────────────────────────────────

  /**
   * Register an agent dynamically (after initialization).
   * Only callable by operators or sovereigns.
   */
  registerAgentWithAuth(agentConfig: AgentConfig, principalId: string): void {
    this.assertInitialized();
    this.principals.validateAuthority({
      principalId,
      requiredLevel: 'operator',
    });
    this.registerAgent(agentConfig);
  }

  /**
   * Get an agent config by id.
   */
  getAgentConfig(agentId: string): AgentConfig | undefined {
    return this.agentConfigs.get(agentId);
  }

  /**
   * List all registered agent configs.
   */
  listAgents(): readonly AgentConfig[] {
    return Array.from(this.agentConfigs.values());
  }

  // ─── Internal helpers ────────────────────────────────────────────────────

  private registerAgent(agentConfig: AgentConfig): void {
    if (this.agentConfigs.has(agentConfig.id)) {
      throw new Error(`Agent already registered: ${agentConfig.id}`);
    }

    this.agentConfigs.set(agentConfig.id, agentConfig);
    this.chain.registerAgent(agentConfig);

    // Index domains for routing
    for (const domain of agentConfig.domains) {
      const existing = this.domainIndex.get(domain);
      if (existing) {
        existing.push(agentConfig.id);
      } else {
        this.domainIndex.set(domain, [agentConfig.id]);
      }
    }
  }

  private assertInitialized(): void {
    if (!this.initialized || this.config === null || this.auditLog === null) {
      throw new Error('Governor is not initialized. Call initialize() first.');
    }
  }

  private async auditRouting(
    message: AgentMessage,
    targetAgentId: string | null,
    routeType: string,
  ): Promise<void> {
    if (!this.auditLog) return;
    await this.auditLog.append({
      timestamp: new Date().toISOString(),
      agent: this.governorId,
      action: `route:${routeType}`,
      outcome: targetAgentId !== null ? 'success' : 'failure',
      metadata: {
        messageId: message.id,
        from: message.from,
        to: message.to,
        type: message.type satisfies MessageType,
        targetAgentId,
      },
    });
  }

  private async auditAction(request: ActionRequest, outcome: string): Promise<void> {
    if (!this.auditLog) return;
    await this.auditLog.append({
      timestamp: new Date().toISOString(),
      agent: request.agentId,
      action: request.action,
      tool: request.toolName ?? undefined,
      outcome: outcome === 'allowed' ? 'success' : outcome === 'denied' ? 'denied' : 'pending_approval',
      metadata: {
        riskLevel: request.estimatedRiskLevel,
        enforcedBy: this.governorId,
      },
    });
  }

  private riskToAuthority(riskLevel: number): AuthorityLevel {
    if (riskLevel >= 8) return 'sovereign';
    if (riskLevel >= 4) return 'operator';
    return 'viewer';
  }
}

// ─── Internal types ──────────────────────────────────────────────────────────

interface ChainOfCommandResult {
  permitted: boolean;
  escalatedTo: string | null;
  reason: string;
}
