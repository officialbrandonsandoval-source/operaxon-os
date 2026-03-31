// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

import type {
  ComplexTask,
  CoordinationResult,
  PhaseResult,
  WorkerResult,
  SynthesisResult,
  ResearchTask,
  Finding,
  ImplementationTask,
} from '@operaxon/types';
import { WorkerPool } from './worker.js';
import type { WorkerTask, WorkerPoolConfig } from './worker.js';
import { synthesize } from './synthesis.js';
import { verify } from './verification.js';
import type { VerificationReport } from './verification.js';

export interface CoordinatorConfig {
  pool?: Partial<WorkerPoolConfig>;
  /** Called for each research task — plug in your own LLM / tool call. */
  researchExecutor?: (task: ResearchTask) => Promise<Finding[]>;
  /** Called for each implementation task — plug in your own code-gen / action. */
  implementationExecutor?: (task: ImplementationTask) => Promise<unknown>;
}

/**
 * CoordinatorEngine — the four-phase orchestration pattern:
 *   Research -> Synthesis -> Implementation -> Verification
 *
 * Each phase produces a PhaseResult. Parallel phases use a bounded WorkerPool.
 * The engine is executor-agnostic: callers inject researchExecutor and
 * implementationExecutor to wire up real LLM calls or tool invocations.
 */
export class CoordinatorEngine {
  private readonly pool: WorkerPool;
  private readonly researchExecutor: (task: ResearchTask) => Promise<Finding[]>;
  private readonly implementationExecutor: (task: ImplementationTask) => Promise<unknown>;

  constructor(config: CoordinatorConfig = {}) {
    this.pool = new WorkerPool(config.pool);
    this.researchExecutor = config.researchExecutor ?? defaultResearchExecutor;
    this.implementationExecutor = config.implementationExecutor ?? defaultImplementationExecutor;
  }

  /**
   * Orchestrate a complex task through all four phases.
   */
  async coordinate(task: ComplexTask): Promise<CoordinationResult> {
    const startTime = Date.now();
    const phases: PhaseResult[] = [];

    // Phase 1: Research — workers run in parallel
    const researchPhase = await this.research(task);
    phases.push(researchPhase);
    if (researchPhase.status === 'failed') {
      return this.buildResult(task.id, 'failed', phases, startTime);
    }

    // Phase 2: Synthesis — coordinator reads ALL findings, builds implementation plan
    const synthesisPhase = await this.synthesizePhase(researchPhase.outputs as WorkerResult[]);
    phases.push(synthesisPhase);
    if (synthesisPhase.status === 'failed') {
      return this.buildResult(task.id, 'failed', phases, startTime);
    }

    // Phase 3: Implementation — workers execute the spec in parallel
    const synthResult = synthesisPhase.outputs[0] as SynthesisResult;
    const implPhase = await this.implement(synthResult);
    phases.push(implPhase);

    // Phase 4: Verification — verify all implementations
    const verifyPhase = await this.verifyPhase(implPhase.outputs as WorkerResult[]);
    phases.push(verifyPhase);

    const report = verifyPhase.outputs[0] as VerificationReport | undefined;
    const finalStatus = report?.overallVerdict === 'pass'
      ? 'completed'
      : report?.overallVerdict === 'partial'
        ? 'partial'
        : 'failed';

    return this.buildResult(task.id, finalStatus, phases, startTime);
  }

  // ────────────────────────────────────────────────────────────────────
  //  Phase 1: Research
  // ────────────────────────────────────────────────────────────────────

  private async research(task: ComplexTask): Promise<PhaseResult> {
    const startTime = Date.now();

    if (task.researchTasks.length === 0) {
      return {
        phase: 'research',
        status: 'failed',
        outputs: [],
        errors: ['No research tasks provided'],
        durationMs: Date.now() - startTime,
      };
    }

    const workerTasks: WorkerTask[] = task.researchTasks.map(rt => ({
      id: rt.id,
      description: rt.query,
      execute: async () => {
        const findings = await this.researchExecutor(rt);
        return { findings };
      },
    }));

    const results = await this.pool.runBatch(workerTasks);

    // Research fails only if ALL workers failed
    const allFailed = results.every(r => r.status === 'failed');
    const errors = results
      .filter(r => r.status === 'failed')
      .map(r => r.error ?? `Worker ${r.workerId} failed`);

    return {
      phase: 'research',
      status: allFailed ? 'failed' : 'completed',
      outputs: results,
      errors,
      durationMs: Date.now() - startTime,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  //  Phase 2: Synthesis
  // ────────────────────────────────────────────────────────────────────

  private async synthesizePhase(researchResults: WorkerResult[]): Promise<PhaseResult> {
    const startTime = Date.now();

    try {
      const result = synthesize(researchResults);

      // Fail synthesis if we got zero actionable tasks
      if (result.tasks.length === 0 && result.findings.length === 0) {
        return {
          phase: 'synthesis',
          status: 'failed',
          outputs: [result],
          errors: ['Synthesis produced no findings and no tasks'],
          durationMs: Date.now() - startTime,
        };
      }

      return {
        phase: 'synthesis',
        status: 'completed',
        outputs: [result],
        errors: [],
        durationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        phase: 'synthesis',
        status: 'failed',
        outputs: [],
        errors: [`Synthesis failed: ${message}`],
        durationMs: Date.now() - startTime,
      };
    }
  }

  // ────────────────────────────────────────────────────────────────────
  //  Phase 3: Implementation
  // ────────────────────────────────────────────────────────────────────

  private async implement(synthesis: SynthesisResult): Promise<PhaseResult> {
    const startTime = Date.now();

    if (synthesis.tasks.length === 0) {
      return {
        phase: 'implementation',
        status: 'completed',
        outputs: [],
        errors: [],
        durationMs: Date.now() - startTime,
      };
    }

    // Group tasks into dependency layers for parallel execution
    const layers = this.buildExecutionLayers(synthesis.tasks);
    const allResults: WorkerResult[] = [];

    for (const layer of layers) {
      const workerTasks: WorkerTask[] = layer.map(implTask => ({
        id: implTask.id,
        description: implTask.description,
        execute: () => this.implementationExecutor(implTask),
      }));

      const layerResults = await this.pool.runBatch(workerTasks);
      allResults.push(...layerResults);

      // If an entire layer fails, stop executing subsequent layers
      const allLayerFailed = layerResults.every(r => r.status === 'failed');
      if (allLayerFailed) {
        break;
      }
    }

    const errors = allResults
      .filter(r => r.status === 'failed')
      .map(r => r.error ?? `Implementation worker ${r.workerId} failed`);

    return {
      phase: 'implementation',
      status: allResults.some(r => r.status === 'completed') ? 'completed' : 'failed',
      outputs: allResults,
      errors,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Partition tasks into layers where each layer's tasks have all
   * dependencies satisfied by previous layers.
   */
  private buildExecutionLayers(tasks: ImplementationTask[]): ImplementationTask[][] {
    const taskIds = new Set(tasks.map(t => t.id));
    const completed = new Set<string>();
    const remaining = [...tasks];
    const layers: ImplementationTask[][] = [];

    while (remaining.length > 0) {
      const layer: ImplementationTask[] = [];
      const stillRemaining: ImplementationTask[] = [];

      for (const task of remaining) {
        // A task is ready if all its dependencies are completed
        // (or reference tasks outside this coordination, which we ignore)
        const ready = task.dependencies.every(
          dep => completed.has(dep) || !taskIds.has(dep),
        );

        if (ready) {
          layer.push(task);
        } else {
          stillRemaining.push(task);
        }
      }

      // Guard against infinite loops from unresolvable cycles
      if (layer.length === 0) {
        // Force-schedule remaining tasks to break the cycle
        layers.push(stillRemaining);
        break;
      }

      layers.push(layer);
      for (const t of layer) {
        completed.add(t.id);
      }
      remaining.length = 0;
      remaining.push(...stillRemaining);
    }

    return layers;
  }

  // ────────────────────────────────────────────────────────────────────
  //  Phase 4: Verification
  // ────────────────────────────────────────────────────────────────────

  private async verifyPhase(implResults: WorkerResult[]): Promise<PhaseResult> {
    return verify(implResults);
  }

  // ────────────────────────────────────────────────────────────────────
  //  Helpers
  // ────────────────────────────────────────────────────────────────────

  private buildResult(
    taskId: string,
    status: CoordinationResult['status'],
    phases: PhaseResult[],
    startTime: number,
  ): CoordinationResult {
    return {
      taskId,
      status,
      phases,
      duration: Date.now() - startTime,
    };
  }
}

// ── Default executors (stubs that return empty results) ───────────────

async function defaultResearchExecutor(task: ResearchTask): Promise<Finding[]> {
  return task.sources.map(source => ({
    source,
    content: `Research result for query "${task.query}" from ${source}`,
    confidence: 0.7,
    relevance: 0.8,
  }));
}

async function defaultImplementationExecutor(task: ImplementationTask): Promise<unknown> {
  return {
    taskId: task.id,
    description: task.description,
    implemented: true,
  };
}
