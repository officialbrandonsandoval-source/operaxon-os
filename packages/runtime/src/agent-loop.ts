// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

/**
 * AgentLoop — wires MERIDIAN + GOVERNOR into the agent execution loop.
 *
 * Every agent action goes through here:
 * 1. Gateway checks agent identity (GOVERNOR)
 * 2. AgentLoop executes the action
 * 3. AgentLoop calls meridian.log(action) after each turn (MERIDIAN)
 * 4. Failed actions log to audit trail (GOVERNOR)
 *
 * Usage:
 *   const loop = new AgentLoop({ identity, meridian, permissions, signer });
 *   await loop.execute('deploy:staging', { toolName: 'git:push', riskLevel: 3 });
 */

import type { AgentIdentity } from '@operaxon/governor';
import { PermissionEngine, AgentSigner } from '@operaxon/governor';
import type { ActionContext, PermissionCheckResult } from '@operaxon/governor';
import type { Meridian } from '@operaxon/meridian';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentLoopOptions {
  identity: AgentIdentity;
  meridian: Meridian;
  permissions: PermissionEngine;
  signer: AgentSigner;
  /** Called when an action requires principal approval */
  onApprovalRequired?: (action: string, approvalLevel: string) => Promise<boolean>;
}

export interface ExecuteOptions {
  toolName?: string;
  riskLevel?: number;
  metadata?: Record<string, unknown>;
  /** If true, skip permission check (for internal/system actions) */
  internal?: boolean;
}

export interface ExecuteResult {
  success: boolean;
  permitted: boolean;
  requiresApproval: boolean;
  approvalLevel: string | null;
  action: string;
  agentId: string;
  signedDecision: import('@operaxon/governor').SignedDecision;
  reason: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// AgentLoop
// ---------------------------------------------------------------------------

export class AgentLoop {
  private readonly identity: AgentIdentity;
  private readonly meridian: Meridian;
  private readonly permissions: PermissionEngine;
  private readonly signer: AgentSigner;
  private readonly onApprovalRequired: ((action: string, level: string) => Promise<boolean>) | null;

  constructor(options: AgentLoopOptions) {
    this.identity = options.identity;
    this.meridian = options.meridian;
    this.permissions = options.permissions;
    this.signer = options.signer;
    this.onApprovalRequired = options.onApprovalRequired ?? null;
  }

  // -----------------------------------------------------------------------
  // Execute an action through the full GOVERNOR + MERIDIAN pipeline
  // -----------------------------------------------------------------------

  /**
   * Execute an agent action with full governance enforcement.
   *
   * Flow:
   * 1. Check GOVERNOR permissions
   * 2. If approval required, call onApprovalRequired handler
   * 3. Sign the decision
   * 4. Log to MERIDIAN
   * 5. Return result
   */
  async execute(action: string, options: ExecuteOptions = {}): Promise<ExecuteResult> {
    const startTime = Date.now();

    // Step 1: Check permissions (unless internal)
    let permCheck: PermissionCheckResult;
    if (options.internal === true) {
      permCheck = {
        allowed: true,
        requiresApproval: false,
        approvalLevel: null,
        reason: 'Internal action — permission check bypassed',
      };
    } else {
      const context: ActionContext = {
        agentId: this.identity.id,
        action,
        capability: options.toolName,
        riskLevel: options.riskLevel,
      };
      permCheck = this.permissions.check(this.identity, context);
    }

    // Step 2: Handle approval requirement
    let approved = permCheck.allowed;
    let approvalOutcome = 'not_required';

    if (!permCheck.allowed && permCheck.requiresApproval) {
      if (this.onApprovalRequired !== null) {
        const wasApproved = await this.onApprovalRequired(
          action,
          permCheck.approvalLevel ?? 'operator',
        );
        approved = wasApproved;
        approvalOutcome = wasApproved ? 'approved' : 'denied';
      } else {
        approvalOutcome = 'pending';
      }
    }

    // Step 3: Sign the decision
    const outcome = approved ? 'approved' : (permCheck.requiresApproval ? 'pending' : 'denied');
    const signedDecision = this.signer.sign({
      agentId: this.identity.id,
      action,
      outcome: approved ? 'executed' : 'denied',
      timestamp: new Date().toISOString(),
      metadata: {
        ...options.metadata,
        approvalOutcome,
        riskLevel: options.riskLevel ?? 0,
      },
    });

    const durationMs = Date.now() - startTime;

    // Step 4: Log to MERIDIAN
    const logStatus = approved ? 'executed' : `denied(${outcome})`;
    await this.meridian.log(
      `${logStatus}: ${action}${options.toolName ? ` [${options.toolName}]` : ''}`,
      {
        agentId: this.identity.id,
        metadata: {
          riskLevel: options.riskLevel,
          approvalLevel: permCheck.approvalLevel,
          durationMs,
          ...options.metadata,
        },
      },
    ).catch(() => {
      // Log failures are non-fatal — never block agent execution over logging
    });

    return {
      success: approved,
      permitted: permCheck.allowed,
      requiresApproval: permCheck.requiresApproval,
      approvalLevel: permCheck.approvalLevel,
      action,
      agentId: this.identity.id,
      signedDecision,
      reason: approved
        ? permCheck.reason
        : (permCheck.requiresApproval ? `Requires ${permCheck.approvalLevel} approval` : permCheck.reason),
      durationMs,
    };
  }

  // -----------------------------------------------------------------------
  // Convenience wrappers
  // -----------------------------------------------------------------------

  /**
   * Log an action without permission check (for informational logging).
   */
  async logAction(action: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.meridian.log(action, {
      agentId: this.identity.id,
      metadata,
    });
  }

  /**
   * Write a lesson to today's memory file.
   */
  async writeLesson(lesson: string): Promise<void> {
    await this.meridian.writeLesson(lesson, this.identity.id);
  }

  /**
   * Search memory for relevant context.
   */
  async searchMemory(query: string, topK: number = 5) {
    return this.meridian.search(query, topK);
  }

  /**
   * Get the agent identity.
   */
  get agentIdentity(): AgentIdentity {
    return this.identity;
  }
}
