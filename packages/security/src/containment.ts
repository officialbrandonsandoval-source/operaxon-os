// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

import type { ContainmentPolicy, AgentConfig } from '@operaxon/types';

export class AgentContainment {
  private policies: Map<string, ContainmentPolicy> = new Map();
  private activeCounts: Map<string, number> = new Map();

  registerAgent(agent: AgentConfig): void {
    this.policies.set(agent.id, agent.containment);
    this.activeCounts.set(agent.id, 0);
  }

  canUseTool(agentId: string, tool: string): ContainmentDecision {
    const policy = this.policies.get(agentId);
    if (!policy) {
      return { allowed: false, reason: `No containment policy found for agent: ${agentId}` };
    }

    // Explicit deny always wins
    if (policy.deniedTools.includes(tool)) {
      return { allowed: false, reason: `Tool "${tool}" is explicitly denied for agent "${agentId}"` };
    }

    // Must be in allowlist (if allowlist is non-empty)
    if (policy.allowedTools.length > 0 && !policy.allowedTools.includes(tool)) {
      return { allowed: false, reason: `Tool "${tool}" is not in the allowlist for agent "${agentId}"` };
    }

    return { allowed: true, reason: 'Tool permitted by containment policy' };
  }

  requiresApproval(agentId: string, action: string): boolean {
    const policy = this.policies.get(agentId);
    if (!policy) return true; // Unknown agents always require approval

    return policy.requiresApproval.some(pattern => {
      // Support simple glob patterns
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(action);
    });
  }

  canStartAction(agentId: string): ContainmentDecision {
    const policy = this.policies.get(agentId);
    if (!policy) {
      return { allowed: false, reason: `No containment policy found for agent: ${agentId}` };
    }

    const current = this.activeCounts.get(agentId) ?? 0;
    if (current >= policy.maxConcurrentActions) {
      return { allowed: false, reason: `Agent "${agentId}" at max concurrent actions (${policy.maxConcurrentActions})` };
    }

    this.activeCounts.set(agentId, current + 1);
    return { allowed: true, reason: 'Action permitted' };
  }

  completeAction(agentId: string): void {
    const current = this.activeCounts.get(agentId) ?? 0;
    this.activeCounts.set(agentId, Math.max(0, current - 1));
  }

  checkClearance(agentId: string, requiredLevel: number): ContainmentDecision {
    const policy = this.policies.get(agentId);
    if (!policy) {
      return { allowed: false, reason: `No containment policy found for agent: ${agentId}` };
    }

    if (policy.clearanceLevel < requiredLevel) {
      return {
        allowed: false,
        reason: `Agent "${agentId}" clearance ${policy.clearanceLevel} insufficient (requires ${requiredLevel})`,
      };
    }

    return { allowed: true, reason: 'Clearance level sufficient' };
  }
}

export interface ContainmentDecision {
  allowed: boolean;
  reason: string;
}
