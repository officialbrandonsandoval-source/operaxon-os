// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

import type { AgentConfig, ContainmentPolicy, AuthorityLevel } from '@operaxon/types';
import { PrincipalRegistry } from './principals.js';

/**
 * A link in the chain of command — represents one entity's position in the hierarchy.
 */
export interface ChainLink {
  entityId: string;
  entityType: 'principal' | 'governor' | 'agent';
  reportsTo: string | null;
  authorityLevel: AuthorityLevel;
}

/**
 * A request for an agent to perform an action, evaluated against the chain.
 */
export interface ActionRequest {
  agentId: string;
  action: string;
  toolName: string | null;
  estimatedRiskLevel: number; // 0-10
}

/**
 * Result of escalating an action to the next level in the chain.
 */
export interface EscalationResult {
  escalated: boolean;
  escalatedTo: string | null;
  reason: string;
}

/**
 * Result of finding the right approver for an action.
 */
export interface ApproverResult {
  found: boolean;
  approverId: string | null;
  authorityLevel: AuthorityLevel | null;
}

/**
 * ChainOfCommand — enforces the Operaxon reporting hierarchy.
 *
 * The hierarchy is strictly linear:
 *   Principals (sovereign > operator > viewer)
 *     └── Governor
 *           └── Agents
 *
 * Agents report to the Governor. The Governor reports to Principals.
 * Actions that exceed an agent's containment clearance must be escalated.
 * The chain determines who can approve what and when escalation is needed.
 */
export class ChainOfCommand {
  private readonly governorId: string;
  private readonly principals: PrincipalRegistry;
  private readonly agentConfigs: Map<string, AgentConfig> = new Map();
  private readonly chain: Map<string, ChainLink> = new Map();

  constructor(governorId: string, principals: PrincipalRegistry) {
    this.governorId = governorId;
    this.principals = principals;

    // Governor always exists in the chain — it reports to the first sovereign.
    this.chain.set(governorId, {
      entityId: governorId,
      entityType: 'governor',
      reportsTo: this.findTopSovereign(),
      authorityLevel: 'operator', // governor has operator-level authority by design
    });
  }

  /**
   * Register an agent in the chain. Agents always report to the governor.
   */
  registerAgent(config: AgentConfig): void {
    this.agentConfigs.set(config.id, config);
    this.chain.set(config.id, {
      entityId: config.id,
      entityType: 'agent',
      reportsTo: this.governorId,
      authorityLevel: 'viewer', // agents have minimum authority; they act on behalf of governor
    });
  }

  /**
   * Remove an agent from the chain.
   */
  removeAgent(agentId: string): boolean {
    this.agentConfigs.delete(agentId);
    return this.chain.delete(agentId);
  }

  /**
   * Get the chain link for an entity.
   */
  getLink(entityId: string): ChainLink | undefined {
    return this.chain.get(entityId);
  }

  /**
   * Get the full chain from an entity up to the top sovereign.
   */
  getChainToTop(entityId: string): readonly ChainLink[] {
    const result: ChainLink[] = [];
    let currentId: string | null = entityId;

    const visited = new Set<string>();
    while (currentId !== null) {
      if (visited.has(currentId)) {
        break; // prevent infinite loops in misconfigured chains
      }
      visited.add(currentId);

      const link = this.chain.get(currentId);
      if (!link) {
        break;
      }
      result.push(link);
      currentId = link.reportsTo;
    }

    return result;
  }

  /**
   * Validate whether an agent is allowed to perform the given action.
   *
   * Checks containment policy, tool allowlists, risk level, and approval requirements.
   * Returns a descriptive result indicating allowed/denied/needs-escalation.
   */
  validateAction(request: ActionRequest): ActionValidationResult {
    const agentConfig = this.agentConfigs.get(request.agentId);
    if (!agentConfig) {
      return {
        allowed: false,
        requiresEscalation: false,
        reason: `Agent not found in chain: ${request.agentId}`,
      };
    }

    const containment = agentConfig.containment;

    // Check if tool is explicitly denied
    if (request.toolName !== null && containment.deniedTools.includes(request.toolName)) {
      return {
        allowed: false,
        requiresEscalation: false,
        reason: `Tool "${request.toolName}" is explicitly denied for agent ${request.agentId}`,
      };
    }

    // Check if tool is in the allowed list (if allowedTools is non-empty, it acts as a whitelist)
    if (
      request.toolName !== null &&
      containment.allowedTools.length > 0 &&
      !containment.allowedTools.includes(request.toolName)
    ) {
      return {
        allowed: false,
        requiresEscalation: false,
        reason: `Tool "${request.toolName}" is not in the allowlist for agent ${request.agentId}`,
      };
    }

    // Check if action matches a pattern that requires approval
    const needsApproval = this.actionMatchesApprovalPattern(request.action, containment);
    if (needsApproval) {
      return {
        allowed: false,
        requiresEscalation: true,
        reason: `Action "${request.action}" requires principal approval for agent ${request.agentId}`,
      };
    }

    // Check if the risk level exceeds the agent's clearance
    if (request.estimatedRiskLevel > containment.clearanceLevel) {
      return {
        allowed: false,
        requiresEscalation: true,
        reason: `Risk level ${request.estimatedRiskLevel} exceeds clearance ${containment.clearanceLevel} for agent ${request.agentId}`,
      };
    }

    return {
      allowed: true,
      requiresEscalation: false,
      reason: 'Action permitted within agent containment policy',
    };
  }

  /**
   * Escalate an action to the next level in the chain.
   *
   * For agents, this escalates to the governor.
   * For the governor, this escalates to the first principal with sufficient authority.
   */
  escalate(entityId: string, action: string, requiredAuthority: AuthorityLevel): EscalationResult {
    const link = this.chain.get(entityId);
    if (!link) {
      return {
        escalated: false,
        escalatedTo: null,
        reason: `Entity not found in chain: ${entityId}`,
      };
    }

    if (link.reportsTo === null) {
      return {
        escalated: false,
        escalatedTo: null,
        reason: `Entity ${entityId} is at the top of the chain — cannot escalate further`,
      };
    }

    // If the entity reports to the governor, escalate to governor first
    if (link.reportsTo === this.governorId) {
      // Governor can handle operator-level actions directly
      if (requiredAuthority === 'operator' || requiredAuthority === 'viewer') {
        return {
          escalated: true,
          escalatedTo: this.governorId,
          reason: `Action "${action}" escalated to governor (${this.governorId})`,
        };
      }

      // Sovereign-level actions must go to a principal
      const approver = this.getApprover(requiredAuthority);
      if (approver.found && approver.approverId !== null) {
        return {
          escalated: true,
          escalatedTo: approver.approverId,
          reason: `Action "${action}" escalated to principal ${approver.approverId} (requires ${requiredAuthority})`,
        };
      }

      return {
        escalated: false,
        escalatedTo: null,
        reason: `No principal with sufficient authority (${requiredAuthority}) found for action "${action}"`,
      };
    }

    // Governor escalating to a principal
    const approver = this.getApprover(requiredAuthority);
    if (approver.found && approver.approverId !== null) {
      return {
        escalated: true,
        escalatedTo: approver.approverId,
        reason: `Action "${action}" escalated from governor to principal ${approver.approverId}`,
      };
    }

    return {
      escalated: false,
      escalatedTo: null,
      reason: `No principal with authority "${requiredAuthority}" available for escalation`,
    };
  }

  /**
   * Find the appropriate approver for an action at the given authority level.
   *
   * Prefers the most recently active principal at or above the required level.
   * If no principal has been active, falls back to the first sovereign.
   */
  getApprover(requiredAuthority: AuthorityLevel): ApproverResult {
    const eligibleRecords = this.principals.listByAuthority(requiredAuthority);

    if (eligibleRecords.length === 0) {
      return { found: false, approverId: null, authorityLevel: null };
    }

    // Prefer the most recently active eligible principal
    const sorted = [...eligibleRecords].sort((a, b) => {
      if (a.lastActiveAt === null && b.lastActiveAt === null) return 0;
      if (a.lastActiveAt === null) return 1;
      if (b.lastActiveAt === null) return -1;
      return b.lastActiveAt.localeCompare(a.lastActiveAt);
    });

    const best = sorted[0];
    if (!best) {
      return { found: false, approverId: null, authorityLevel: null };
    }

    return {
      found: true,
      approverId: best.principal.id,
      authorityLevel: best.principal.authority,
    };
  }

  /**
   * Rebuild principal links in the chain. Call after principals change.
   */
  refreshPrincipalLinks(): void {
    const governorLink = this.chain.get(this.governorId);
    if (governorLink) {
      governorLink.reportsTo = this.findTopSovereign();
    }
  }

  private findTopSovereign(): string | null {
    const sovereigns = this.principals.listByAuthority('sovereign');
    if (sovereigns.length === 0) {
      return null;
    }
    const first = sovereigns[0];
    return first ? first.principal.id : null;
  }

  private actionMatchesApprovalPattern(action: string, containment: ContainmentPolicy): boolean {
    return containment.requiresApproval.some((pattern) => {
      // Support simple glob-like patterns: "deploy:*" matches "deploy:production"
      if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        return action.startsWith(prefix);
      }
      return action === pattern;
    });
  }
}

/**
 * Internal result of validating an action against the chain.
 */
interface ActionValidationResult {
  allowed: boolean;
  requiresEscalation: boolean;
  reason: string;
}
