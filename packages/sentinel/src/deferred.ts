// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

import type { PlannedAction } from '@operaxon/types';

/**
 * An entry in the deferred queue, wrapping a PlannedAction with metadata.
 */
export interface DeferredEntry {
  action: PlannedAction;
  enqueuedAt: Date;
  reason: string;
}

/**
 * A queue for actions that exceeded the sentinel's blocking budget.
 *
 * Actions land here when their estimatedMs exceeds BLOCKING_BUDGET_MS.
 * They are processed one-at-a-time during subsequent ticks when budget allows.
 */
export class DeferredQueue {
  private readonly queue: DeferredEntry[] = [];

  /**
   * Add an action to the back of the deferred queue.
   */
  add(action: PlannedAction, reason?: string): void {
    this.queue.push({
      action,
      enqueuedAt: new Date(),
      reason: reason ?? 'exceeded blocking budget',
    });
  }

  /**
   * Remove and return the next deferred action if its estimatedMs fits
   * within the given budget. Returns null if the queue is empty or the
   * next action still exceeds the budget.
   */
  processNext(budgetMs: number): DeferredEntry | null {
    if (this.queue.length === 0) return null;

    const next = this.queue[0];
    if (!next || next.action.estimatedMs > budgetMs) return null;

    return this.queue.shift() ?? null;
  }

  /**
   * View the next action without removing it from the queue.
   */
  peek(): DeferredEntry | null {
    return this.queue[0] ?? null;
  }

  /**
   * Remove all deferred actions.
   */
  clear(): void {
    this.queue.length = 0;
  }

  /**
   * Number of actions currently deferred.
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Whether the queue has any entries.
   */
  get isEmpty(): boolean {
    return this.queue.length === 0;
  }
}
