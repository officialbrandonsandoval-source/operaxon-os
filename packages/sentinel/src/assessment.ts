// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

import type {
  TickContext,
  Assessment,
  PlannedAction,
  ProactiveChecks,
  HealthStatus,
} from '@operaxon/types';

/**
 * Priority thresholds — the sentinel biases toward silence.
 * An assessment must reach at least ACTION_THRESHOLD to justify acting.
 */
const ACTION_THRESHOLD = 4;

/**
 * Weights for individual signal dimensions.
 * Tuned so that noise never exceeds the threshold on its own.
 */
const WEIGHTS = {
  pendingTasks: 0.3,
  unreadMessages: 0.2,
  agentErrors: 2.5,
  healthDegraded: 3.0,
  healthCritical: 8.0,
} as const;

/**
 * Assess the current tick context and decide whether the sentinel should act.
 *
 * Design philosophy: "No flooding, no noise."
 * The sentinel stays silent unless an action is truly needed.
 */
export function assess(
  context: TickContext,
  enabledChecks: ProactiveChecks,
): Assessment {
  let priority = 0;
  const reasons: string[] = [];

  // --- System health (always checked) ---
  priority += healthScore(context.civilizationState.health, reasons);

  // --- Pending tasks ---
  if (enabledChecks.agentCompletions && context.pendingTasks > 0) {
    const taskScore = Math.min(context.pendingTasks * WEIGHTS.pendingTasks, 3);
    priority += taskScore;
    if (taskScore >= 1) {
      reasons.push(`${context.pendingTasks} pending task(s)`);
    }
  }

  // --- Unread messages ---
  if (enabledChecks.email && context.unreadMessages > 0) {
    const msgScore = Math.min(context.unreadMessages * WEIGHTS.unreadMessages, 2);
    priority += msgScore;
    if (msgScore >= 1) {
      reasons.push(`${context.unreadMessages} unread message(s)`);
    }
  }

  // --- Agent statuses ---
  if (enabledChecks.agentCompletions) {
    const errorAgents = Object.entries(context.agentStatuses).filter(
      ([, status]) => status === 'error',
    );
    if (errorAgents.length > 0) {
      const agentScore = errorAgents.length * WEIGHTS.agentErrors;
      priority += agentScore;
      const names = errorAgents.map(([name]) => name).join(', ');
      reasons.push(`agent(s) in error state: ${names}`);
    }
  }

  // Clamp priority to 0-10 range
  priority = Math.min(Math.max(Math.round(priority * 10) / 10, 0), 10);

  const shouldAct = priority >= ACTION_THRESHOLD;
  const reason = reasons.length > 0
    ? reasons.join('; ')
    : 'all clear — no action needed';

  const suggestedAction = shouldAct
    ? planAction(context, priority, reasons)
    : undefined;

  return { shouldAct, priority, reason, suggestedAction };
}

/**
 * Convert system health status into a priority contribution.
 */
function healthScore(status: HealthStatus, reasons: string[]): number {
  switch (status) {
    case 'critical':
      reasons.push('system health is critical');
      return WEIGHTS.healthCritical;
    case 'degraded':
      reasons.push('system health is degraded');
      return WEIGHTS.healthDegraded;
    case 'healthy':
      return 0;
  }
}

/**
 * Given context that warrants action, determine the best next step.
 */
function planAction(
  context: TickContext,
  priority: number,
  reasons: string[],
): PlannedAction {
  const isCritical = context.civilizationState.health === 'critical';

  // Critical health → fast remediation
  if (isCritical) {
    return {
      type: 'system_remediation',
      description: `Critical health detected: ${reasons.join('; ')}`,
      estimatedMs: 5_000,
      requiresApproval: false,
    };
  }

  // Error agents → restart or escalate
  const errorAgents = Object.entries(context.agentStatuses).filter(
    ([, status]) => status === 'error',
  );
  if (errorAgents.length > 0) {
    const targetAgent = errorAgents[0]?.[0];
    return {
      type: 'agent_recovery',
      description: `Recover agent(s) in error state: ${errorAgents.map(([n]) => n).join(', ')}`,
      estimatedMs: 8_000,
      requiresApproval: priority < 7,
      targetAgent,
    };
  }

  // Pending tasks → triage and delegate
  if (context.pendingTasks > 0) {
    return {
      type: 'task_triage',
      description: `Triage ${context.pendingTasks} pending task(s)`,
      estimatedMs: 3_000,
      requiresApproval: true,
    };
  }

  // Fallback: generic notification
  return {
    type: 'notification',
    description: reasons.join('; '),
    estimatedMs: 1_000,
    requiresApproval: false,
  };
}
