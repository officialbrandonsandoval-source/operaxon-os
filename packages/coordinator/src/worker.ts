// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

import type { WorkerResult } from '@operaxon/types';

export type WorkerStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface WorkerHandle {
  readonly id: string;
  readonly taskId: string;
  status: WorkerStatus;
  startedAt: number;
  completedAt: number | null;
  result: WorkerResult | null;
}

export interface WorkerTask {
  id: string;
  description: string;
  execute: () => Promise<unknown>;
}

export interface WorkerPoolConfig {
  maxConcurrency: number;
  taskTimeoutMs: number;
}

const DEFAULT_CONFIG: WorkerPoolConfig = {
  maxConcurrency: 8,
  taskTimeoutMs: 30_000,
};

export class WorkerPool {
  private readonly config: WorkerPoolConfig;
  private readonly workers: Map<string, WorkerHandle> = new Map();
  private activeCount = 0;

  constructor(config: Partial<WorkerPoolConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  get active(): number {
    return this.activeCount;
  }

  get size(): number {
    return this.workers.size;
  }

  getWorker(workerId: string): WorkerHandle | undefined {
    return this.workers.get(workerId);
  }

  /**
   * Run a batch of tasks with bounded concurrency.
   * Returns results in the same order as the input tasks.
   */
  async runBatch(tasks: WorkerTask[]): Promise<WorkerResult[]> {
    const results: WorkerResult[] = new Array(tasks.length);
    const pending: Array<Promise<void>> = [];
    let cursor = 0;

    const scheduleNext = (): Promise<void> | undefined => {
      if (cursor >= tasks.length) return undefined;
      const index = cursor;
      const task = tasks[cursor]!;
      cursor++;
      const promise = this.spawnWorker(task).then(result => {
        results[index] = result;
        // backfill next task into freed slot
        const next = scheduleNext();
        if (next) pending.push(next);
      });
      return promise;
    };

    // seed initial batch up to max concurrency
    const initialCount = Math.min(this.config.maxConcurrency, tasks.length);
    for (let i = 0; i < initialCount; i++) {
      const p = scheduleNext();
      if (p) pending.push(p);
    }

    await Promise.all(pending);
    return results;
  }

  /**
   * Spawn a single worker for a task, respecting the timeout.
   * Failures are captured, never thrown.
   */
  async spawnWorker(task: WorkerTask): Promise<WorkerResult> {
    const workerId = `worker-${crypto.randomUUID()}`;
    const handle: WorkerHandle = {
      id: workerId,
      taskId: task.id,
      status: 'running',
      startedAt: Date.now(),
      completedAt: null,
      result: null,
    };

    this.workers.set(workerId, handle);
    this.activeCount++;

    try {
      const output = await this.executeWithTimeout(task.execute, this.config.taskTimeoutMs);
      const durationMs = Date.now() - handle.startedAt;

      const result: WorkerResult = {
        workerId,
        taskId: task.id,
        status: 'completed',
        output,
        durationMs,
      };

      handle.status = 'completed';
      handle.completedAt = Date.now();
      handle.result = result;
      return result;
    } catch (err: unknown) {
      const durationMs = Date.now() - handle.startedAt;
      const errorMessage = err instanceof Error ? err.message : String(err);

      const result: WorkerResult = {
        workerId,
        taskId: task.id,
        status: 'failed',
        output: null,
        error: errorMessage,
        durationMs,
      };

      handle.status = 'failed';
      handle.completedAt = Date.now();
      handle.result = result;
      return result;
    } finally {
      this.activeCount--;
    }
  }

  /** Reset the pool, clearing all worker records. */
  reset(): void {
    this.workers.clear();
    this.activeCount = 0;
  }

  private async executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Worker timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      fn().then(
        value => {
          clearTimeout(timer);
          resolve(value);
        },
        err => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }
}
