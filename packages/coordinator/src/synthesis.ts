// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

import type {
  WorkerResult,
  Finding,
  ImplementationTask,
  SynthesisResult,
} from '@operaxon/types';

interface ResearchOutput {
  findings: Finding[];
}

/**
 * Synthesize research results into an ordered implementation plan.
 *
 * Reads every finding from every worker, deduplicates, scores relevance,
 * identifies inter-task dependencies, calculates risk factors, and produces
 * a topologically-sorted task list.
 */
export function synthesize(researchResults: WorkerResult[]): SynthesisResult {
  // ── Step 1: Collect all findings from successful research workers ──
  const allFindings: Finding[] = [];
  const errors: string[] = [];

  for (const result of researchResults) {
    if (result.status === 'failed') {
      errors.push(result.error ?? `Worker ${result.workerId} failed without error message`);
      continue;
    }

    const output = result.output as ResearchOutput | null;
    if (output?.findings) {
      for (const finding of output.findings) {
        allFindings.push(finding);
      }
    }
  }

  // ── Step 2: Deduplicate findings by source+content ──
  const seen = new Set<string>();
  const uniqueFindings: Finding[] = [];
  for (const finding of allFindings) {
    const key = `${finding.source}::${finding.content}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueFindings.push(finding);
    }
  }

  // ── Step 3: Score and rank findings ──
  const scoredFindings = uniqueFindings
    .map(f => ({
      ...f,
      score: f.confidence * 0.6 + f.relevance * 0.4,
    }))
    .sort((a, b) => b.score - a.score);

  const rankedFindings: Finding[] = scoredFindings.map(({ score: _score, ...f }) => f);

  // ── Step 4: Extract implementation tasks from findings ──
  const rawTasks = extractTasks(rankedFindings);

  // ── Step 5: Identify dependencies between tasks ──
  const tasksWithDeps = identifyDependencies(rawTasks);

  // ── Step 6: Topological sort respecting dependencies ──
  const orderedTasks = topologicalSort(tasksWithDeps);

  // ── Step 7: Calculate risk factors ──
  const risks = calculateRisks(rankedFindings, orderedTasks, errors);

  return {
    findings: rankedFindings,
    tasks: orderedTasks,
    risks,
  };
}

/**
 * Derive implementation tasks from ranked findings.
 * Each high-confidence finding becomes a task; low-confidence ones
 * are grouped into broader investigation tasks.
 */
function extractTasks(findings: Finding[]): ImplementationTask[] {
  const tasks: ImplementationTask[] = [];
  const lowConfidenceSources: string[] = [];

  for (const finding of findings) {
    if (finding.confidence >= 0.5) {
      tasks.push({
        id: `task-${crypto.randomUUID()}`,
        description: `Implement based on finding from ${finding.source}: ${finding.content}`,
        dependencies: [],
        estimatedMs: Math.round(1000 + (1 - finding.confidence) * 9000), // higher confidence → faster
      });
    } else {
      lowConfidenceSources.push(finding.source);
    }
  }

  // Group low-confidence findings into a single investigation task
  if (lowConfidenceSources.length > 0) {
    tasks.push({
      id: `task-${crypto.randomUUID()}`,
      description: `Investigate low-confidence findings from: ${[...new Set(lowConfidenceSources)].join(', ')}`,
      dependencies: [],
      estimatedMs: 5000,
    });
  }

  return tasks;
}

/**
 * Walk through tasks and wire up dependency edges.
 * A task depends on earlier tasks when its description references
 * the same source material, indicating sequential work.
 */
function identifyDependencies(tasks: ImplementationTask[]): ImplementationTask[] {
  const sourceMap = new Map<string, string>(); // source keyword → first task id

  return tasks.map(task => {
    const deps: string[] = [];

    // Look for references to sources already covered by prior tasks
    for (const [sourceKey, dependencyId] of sourceMap) {
      if (task.description.includes(sourceKey) && dependencyId !== task.id) {
        deps.push(dependencyId);
      }
    }

    // Extract the source keyword from this task's description
    const sourceMatch = /from\s+([^:]+):/.exec(task.description);
    if (sourceMatch?.[1]) {
      const sourceKey = sourceMatch[1].trim();
      if (!sourceMap.has(sourceKey)) {
        sourceMap.set(sourceKey, task.id);
      }
    }

    return {
      ...task,
      dependencies: [...new Set([...task.dependencies, ...deps])],
    };
  });
}

/**
 * Kahn's algorithm for topological sort.
 * Tasks with no dependencies come first; cycles are appended at the end
 * to ensure we never deadlock.
 */
function topologicalSort(tasks: ImplementationTask[]): ImplementationTask[] {
  const taskMap = new Map<string, ImplementationTask>();
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const task of tasks) {
    taskMap.set(task.id, task);
    inDegree.set(task.id, 0);
    adjacency.set(task.id, []);
  }

  // Build in-degree counts
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (taskMap.has(dep)) {
        const current = inDegree.get(task.id) ?? 0;
        inDegree.set(task.id, current + 1);
        const adj = adjacency.get(dep) ?? [];
        adj.push(task.id);
        adjacency.set(dep, adj);
      }
    }
  }

  // Seed queue with zero-dependency tasks
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const sorted: ImplementationTask[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const task = taskMap.get(id);
    if (task) {
      sorted.push(task);
      taskMap.delete(id);
    }

    for (const neighbor of adjacency.get(id) ?? []) {
      const deg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, deg);
      if (deg === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Any remaining tasks are in a cycle — append them to avoid deadlock
  for (const remaining of taskMap.values()) {
    sorted.push(remaining);
  }

  return sorted;
}

/**
 * Assess risk factors based on research quality and task characteristics.
 */
function calculateRisks(
  findings: Finding[],
  tasks: ImplementationTask[],
  researchErrors: string[],
): string[] {
  const risks: string[] = [];

  // Risk: research workers failed
  if (researchErrors.length > 0) {
    risks.push(
      `${researchErrors.length} research worker(s) failed — plan may be based on incomplete data`,
    );
  }

  // Risk: low average confidence
  if (findings.length > 0) {
    const avgConfidence = findings.reduce((sum, f) => sum + f.confidence, 0) / findings.length;
    if (avgConfidence < 0.5) {
      risks.push(
        `Average finding confidence is ${(avgConfidence * 100).toFixed(0)}% — high uncertainty in research`,
      );
    }
  } else {
    risks.push('No findings produced — implementation plan is empty');
  }

  // Risk: many dependencies may cause bottlenecks
  const maxDeps = Math.max(0, ...tasks.map(t => t.dependencies.length));
  if (maxDeps >= 3) {
    risks.push(
      `Task dependency chain depth of ${maxDeps} — potential serialization bottleneck`,
    );
  }

  // Risk: too many tasks for a single coordination round
  if (tasks.length > 20) {
    risks.push(
      `${tasks.length} tasks generated — consider splitting into sub-coordinations`,
    );
  }

  // Risk: tight deadline with high estimated time
  const totalEstMs = tasks.reduce((sum, t) => sum + (t.estimatedMs ?? 0), 0);
  if (totalEstMs > 60_000) {
    risks.push(
      `Total estimated implementation time is ${(totalEstMs / 1000).toFixed(1)}s — may exceed deadlines`,
    );
  }

  return risks;
}
