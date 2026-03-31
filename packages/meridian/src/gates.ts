// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { MeridianConfig, MeridianState } from '@operaxon/types';

// ---------------------------------------------------------------------------
// TimeGate — enforces minimum elapsed time since last consolidation
// ---------------------------------------------------------------------------

export interface TimeGateResult {
  passed: boolean;
  hoursSinceLast: number;
  requiredHours: number;
  lastConsolidation: string | null;
}

export class TimeGate {
  private readonly requiredHours: number;

  constructor(config: Pick<MeridianConfig, 'timeGateHours'>) {
    this.requiredHours = config.timeGateHours;
  }

  check(state: MeridianState): TimeGateResult {
    if (state.lastConsolidation === null) {
      // Never consolidated — gate passes immediately
      return {
        passed: true,
        hoursSinceLast: Infinity,
        requiredHours: this.requiredHours,
        lastConsolidation: null,
      };
    }

    const lastTime = new Date(state.lastConsolidation).getTime();
    const now = Date.now();
    const elapsedMs = now - lastTime;
    const elapsedHours = elapsedMs / (1000 * 60 * 60);

    return {
      passed: elapsedHours >= this.requiredHours,
      hoursSinceLast: elapsedHours,
      requiredHours: this.requiredHours,
      lastConsolidation: state.lastConsolidation,
    };
  }
}

// ---------------------------------------------------------------------------
// SessionGate — enforces minimum session count since last consolidation
// ---------------------------------------------------------------------------

export interface SessionGateResult {
  passed: boolean;
  sessionCount: number;
  requiredSessions: number;
}

export class SessionGate {
  private readonly requiredSessions: number;

  constructor(config: Pick<MeridianConfig, 'sessionGateCount'>) {
    this.requiredSessions = config.sessionGateCount;
  }

  check(state: MeridianState): SessionGateResult {
    return {
      passed: state.sessionsSinceLastConsolidation >= this.requiredSessions,
      sessionCount: state.sessionsSinceLastConsolidation,
      requiredSessions: this.requiredSessions,
    };
  }
}

// ---------------------------------------------------------------------------
// LockGate — filesystem lock to prevent concurrent consolidation
// ---------------------------------------------------------------------------

export interface LockGateResult {
  acquired: boolean;
  reason?: string;
  lockHolder?: string;
  lockAge?: number;
}

/** Maximum age of a lock before it is considered stale (in milliseconds). */
const STALE_LOCK_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

interface LockFileContent {
  holder: string;
  acquiredAt: string;
  pid: number;
}

export class LockGate {
  private readonly lockPath: string;
  private readonly holderId: string;
  private readonly staleLockThresholdMs: number;
  private held = false;

  constructor(
    storagePath: string,
    holderId: string,
    staleLockThresholdMs: number = STALE_LOCK_THRESHOLD_MS,
  ) {
    this.lockPath = join(storagePath, 'dream.lock');
    this.holderId = holderId;
    this.staleLockThresholdMs = staleLockThresholdMs;
  }

  /**
   * Attempts to acquire the dream lock.
   *
   * If a stale lock is detected (older than the configured threshold),
   * it is forcibly removed before acquiring a new one.
   */
  async acquire(): Promise<LockGateResult> {
    // Ensure the parent directory exists
    const dir = join(this.lockPath, '..');
    await mkdir(dir, { recursive: true });

    // Check for an existing lock
    const existing = await this.readLock();

    if (existing !== null) {
      const lockAge = Date.now() - new Date(existing.acquiredAt).getTime();

      if (lockAge < this.staleLockThresholdMs) {
        // Lock is fresh — someone else is consolidating
        return {
          acquired: false,
          reason: 'Lock held by another process',
          lockHolder: existing.holder,
          lockAge,
        };
      }

      // Stale lock — force removal
      await this.forceRelease();
    }

    // Write our lock file atomically
    const lockContent: LockFileContent = {
      holder: this.holderId,
      acquiredAt: new Date().toISOString(),
      pid: process.pid,
    };

    const tmpPath = this.lockPath + '.tmp';
    await writeFile(tmpPath, JSON.stringify(lockContent, null, 2), 'utf8');

    // Rename is atomic on POSIX systems
    const { rename } = await import('node:fs/promises');
    await rename(tmpPath, this.lockPath);

    this.held = true;

    return { acquired: true };
  }

  /**
   * Releases the lock if it is held by this instance.
   * Returns `true` if the lock was released, `false` if it was not held.
   */
  async release(): Promise<boolean> {
    if (!this.held) {
      return false;
    }

    // Verify we still own the lock before removing
    const existing = await this.readLock();
    if (existing === null || existing.holder !== this.holderId) {
      this.held = false;
      return false;
    }

    await this.forceRelease();
    this.held = false;
    return true;
  }

  /** Whether this instance currently holds the lock. */
  get isHeld(): boolean {
    return this.held;
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private async readLock(): Promise<LockFileContent | null> {
    try {
      const raw = await readFile(this.lockPath, 'utf8');
      return JSON.parse(raw) as LockFileContent;
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  private async forceRelease(): Promise<void> {
    try {
      await unlink(this.lockPath);
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        return; // Already gone
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// GateCoordinator — runs all three gates in sequence
// ---------------------------------------------------------------------------

export interface GateCheckResult {
  allPassed: boolean;
  time: TimeGateResult;
  session: SessionGateResult;
  lock: LockGateResult;
}

export class GateCoordinator {
  private readonly timeGate: TimeGate;
  private readonly sessionGate: SessionGate;
  private readonly lockGate: LockGate;

  constructor(
    config: MeridianConfig,
    holderId: string,
    staleLockThresholdMs?: number,
  ) {
    this.timeGate = new TimeGate(config);
    this.sessionGate = new SessionGate(config);
    this.lockGate = new LockGate(config.storagePath, holderId, staleLockThresholdMs);
  }

  /**
   * Evaluates all three gates in order. The lock gate is only attempted
   * if both the time gate and session gate pass — this avoids holding a lock
   * we would immediately release.
   */
  async check(state: MeridianState): Promise<GateCheckResult> {
    const time = this.timeGate.check(state);
    const session = this.sessionGate.check(state);

    // Short-circuit: don't acquire a lock if prior gates failed
    if (!time.passed || !session.passed) {
      return {
        allPassed: false,
        time,
        session,
        lock: { acquired: false, reason: 'Prior gate(s) did not pass' },
      };
    }

    const lock = await this.lockGate.acquire();

    return {
      allPassed: time.passed && session.passed && lock.acquired,
      time,
      session,
      lock,
    };
  }

  /** Release the lock (safe to call even if not held). */
  async releaseLock(): Promise<boolean> {
    return this.lockGate.release();
  }

  get lock(): LockGate {
    return this.lockGate;
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

interface NodeError extends Error {
  code?: string;
}

function isNodeError(err: unknown): err is NodeError {
  return err instanceof Error && 'code' in err;
}
