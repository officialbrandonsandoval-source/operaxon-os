// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

import type {
  SentinelConfig,
  TickContext,
  Assessment,
  PlannedAction,
} from '@operaxon/types';

import { SilentHoursManager } from './silent-hours.js';
import { assess } from './assessment.js';
import { DeferredQueue } from './deferred.js';
import type { DeferredEntry } from './deferred.js';

/**
 * Callback invoked when the engine executes an action.
 * Consumers wire this up to their own execution layer.
 */
export type ActionExecutor = (action: PlannedAction) => Promise<void>;

/**
 * Callback invoked on every completed tick with the assessment result.
 */
export type TickListener = (assessment: Assessment) => void;

/**
 * SentinelEngine — the KAIROS proactive tick loop.
 *
 * Periodically assesses system state and acts only when genuinely needed.
 * Actions that exceed the blocking budget are deferred for later processing.
 */
export class SentinelEngine {
  private readonly BLOCKING_BUDGET_MS: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  private readonly config: SentinelConfig;
  private readonly silentHours: SilentHoursManager;
  private readonly deferred: DeferredQueue;

  private executor: ActionExecutor | null = null;
  private tickListeners: TickListener[] = [];

  constructor(config: SentinelConfig) {
    this.config = config;
    this.BLOCKING_BUDGET_MS = config.blockingBudgetMs;
    this.silentHours = new SilentHoursManager(config.silentHours);
    this.deferred = new DeferredQueue();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Start the tick loop at the configured interval.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(
      () => void this.tick(),
      this.config.tickIntervalMs,
    );
  }

  /**
   * Stop the tick loop and clear the interval timer.
   */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Whether the engine is currently running.
   */
  get isRunning(): boolean {
    return this.running;
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  /**
   * Register an executor that will be called when the engine decides to act.
   */
  onAction(executor: ActionExecutor): void {
    this.executor = executor;
  }

  /**
   * Register a listener that is notified after every tick assessment.
   */
  onTick(listener: TickListener): void {
    this.tickListeners.push(listener);
  }

  /**
   * Access the deferred action queue for external inspection or management.
   */
  getDeferredQueue(): DeferredQueue {
    return this.deferred;
  }

  /**
   * Access the silent hours manager.
   */
  getSilentHoursManager(): SilentHoursManager {
    return this.silentHours;
  }

  // ---------------------------------------------------------------------------
  // Core tick
  // ---------------------------------------------------------------------------

  /**
   * Execute a single tick. Can be called externally for manual triggering
   * or invoked automatically by the interval timer.
   */
  async tick(context?: TickContext): Promise<void> {
    if (!this.running) return;

    // Respect silent hours
    if (this.silentHours.isInSilentHours()) return;

    // Build a default context if none was provided
    const ctx = context ?? this.buildDefaultContext();

    // Assess current state
    const assessment = await this.assess(ctx);

    // Notify tick listeners
    for (const listener of this.tickListeners) {
      listener(assessment);
    }

    if (!assessment.shouldAct) {
      // Even if we're not acting on new signals, try to drain deferred queue
      await this.drainDeferred();
      return;
    }

    if (assessment.suggestedAction) {
      if (assessment.suggestedAction.estimatedMs > this.BLOCKING_BUDGET_MS) {
        await this.defer(assessment.suggestedAction);
        return;
      }
      await this.execute(assessment.suggestedAction);
    }
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /**
   * Run assessment logic against the current tick context.
   */
  private async assess(context: TickContext): Promise<Assessment> {
    // The assess function is synchronous today, but the interface is async
    // to allow future integration with external data sources.
    return assess(context, this.config.proactiveChecks);
  }

  /**
   * Execute a planned action through the registered executor.
   */
  private async execute(action: PlannedAction): Promise<void> {
    if (!this.executor) return;
    await this.executor(action);
  }

  /**
   * Defer an action that exceeds the blocking budget.
   */
  private async defer(action: PlannedAction): Promise<void> {
    this.deferred.add(
      action,
      `estimatedMs (${action.estimatedMs}) exceeds budget (${this.BLOCKING_BUDGET_MS})`,
    );
  }

  /**
   * Attempt to process deferred actions that now fit within budget.
   */
  private async drainDeferred(): Promise<void> {
    const entry: DeferredEntry | null = this.deferred.processNext(
      this.BLOCKING_BUDGET_MS,
    );
    if (entry) {
      await this.execute(entry.action);
    }
  }

  /**
   * Build a minimal default TickContext when none is provided.
   */
  private buildDefaultContext(): TickContext {
    return {
      timestamp: new Date().toISOString(),
      civilizationState: {
        name: 'unknown',
        uptime: 0,
        activeAgents: 0,
        totalTasks: 0,
        health: 'healthy',
      },
      pendingTasks: 0,
      unreadMessages: 0,
      agentStatuses: {},
    };
  }
}
