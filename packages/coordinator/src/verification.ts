// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

import type { WorkerResult, PhaseResult } from '@operaxon/types';

export interface VerificationReport {
  totalWorkers: number;
  succeeded: number;
  failed: number;
  failedTaskIds: string[];
  averageDurationMs: number;
  slowestWorker: { workerId: string; durationMs: number } | null;
  overallVerdict: 'pass' | 'partial' | 'fail';
}

/**
 * Verify implementation results and produce a PhaseResult for the verification phase.
 *
 * Checks every worker result for errors or incomplete work, aggregates metrics,
 * and determines whether the coordination succeeded, partially succeeded, or failed.
 */
export function verify(implResults: WorkerResult[]): PhaseResult {
  const startTime = Date.now();
  const report = buildVerificationReport(implResults);
  const errors = collectErrors(implResults);

  const status = report.overallVerdict === 'fail' ? 'failed' : 'completed';

  return {
    phase: 'verification',
    status,
    outputs: [report],
    errors,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Build a detailed verification report from implementation worker results.
 */
function buildVerificationReport(results: WorkerResult[]): VerificationReport {
  const total = results.length;
  const succeeded = results.filter(r => r.status === 'completed').length;
  const failed = total - succeeded;

  const failedTaskIds = results
    .filter(r => r.status === 'failed')
    .map(r => r.taskId);

  // Average duration across all workers
  const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);
  const averageDurationMs = total > 0 ? Math.round(totalDurationMs / total) : 0;

  // Find the slowest worker
  let slowestWorker: VerificationReport['slowestWorker'] = null;
  for (const result of results) {
    if (slowestWorker === null || result.durationMs > slowestWorker.durationMs) {
      slowestWorker = { workerId: result.workerId, durationMs: result.durationMs };
    }
  }

  // Determine overall verdict
  const overallVerdict = determineVerdict(total, succeeded, failed);

  return {
    totalWorkers: total,
    succeeded,
    failed,
    failedTaskIds,
    averageDurationMs,
    slowestWorker,
    overallVerdict,
  };
}

/**
 * Determine the overall verdict based on success/failure ratios.
 *
 * - 'pass': all workers succeeded
 * - 'partial': some workers succeeded (> 50% success rate)
 * - 'fail': majority failed or no workers ran
 */
function determineVerdict(
  total: number,
  succeeded: number,
  _failed: number,
): 'pass' | 'partial' | 'fail' {
  if (total === 0) return 'fail';
  if (succeeded === total) return 'pass';

  const successRate = succeeded / total;
  if (successRate > 0.5) return 'partial';

  return 'fail';
}

/**
 * Collect all error messages from failed workers.
 */
function collectErrors(results: WorkerResult[]): string[] {
  const errors: string[] = [];

  for (const result of results) {
    if (result.status === 'failed') {
      const msg = result.error
        ? `Worker ${result.workerId} (task ${result.taskId}): ${result.error}`
        : `Worker ${result.workerId} (task ${result.taskId}): unknown failure`;
      errors.push(msg);
    }

    // Check for workers that completed but returned null/empty output
    if (result.status === 'completed' && result.output === null) {
      errors.push(
        `Worker ${result.workerId} (task ${result.taskId}): completed with null output — possible incomplete work`,
      );
    }
  }

  return errors;
}
