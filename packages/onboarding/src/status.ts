// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * status.ts — Real-time onboarding progress tracking
 * Questionnaire (25%) → Provisioning (50%) → Deployment (75%) → Live (100%)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Stage definitions ────────────────────────────────────────────────────────

export type OnboardingStage =
  | 'inquiry'       // 0%  — customer submitted interest
  | 'questionnaire' // 25% — questionnaire completed
  | 'provisioning'  // 50% — configs generated
  | 'deploying'     // 75% — instance spinning up
  | 'live';         // 100% — running and healthy

export const STAGE_PROGRESS: Record<OnboardingStage, number> = {
  inquiry: 0,
  questionnaire: 25,
  provisioning: 50,
  deploying: 75,
  live: 100,
};

export const STAGE_DESCRIPTIONS: Record<OnboardingStage, string> = {
  inquiry: 'Customer submitted interest — questionnaire pending',
  questionnaire: 'Questionnaire completed — generating configuration',
  provisioning: 'Configuration generated — starting deployment',
  deploying: 'Deployment in progress — spinning up your instance',
  live: 'Instance is live — your agents are ready',
};

// ─── Status record ────────────────────────────────────────────────────────────

export interface OnboardingStatus {
  customerId: string;
  tenantId: string;
  stage: OnboardingStage;
  progress: number;           // 0–100
  description: string;
  startedAt: string;          // ISO 8601
  updatedAt: string;          // ISO 8601
  completedAt?: string;       // ISO 8601 — set when stage = 'live'
  stageHistory: StageEvent[];
  errors: string[];
  instanceUrl?: string;
  estimatedMinutesRemaining?: number;
}

export interface StageEvent {
  stage: OnboardingStage;
  enteredAt: string;          // ISO 8601
  message: string;
}

// ─── StatusTracker ────────────────────────────────────────────────────────────

export class StatusTracker {
  private storePath: string;
  private statuses: Map<string, OnboardingStatus> = new Map();

  constructor(storePath: string) {
    this.storePath = storePath;
    this.load();
  }

  private load(): void {
    if (fs.existsSync(this.storePath)) {
      const raw = fs.readFileSync(this.storePath, 'utf-8');
      const records: OnboardingStatus[] = JSON.parse(raw);
      for (const s of records) {
        this.statuses.set(s.customerId, s);
      }
    }
  }

  private save(): void {
    const dir = path.dirname(this.storePath);
    fs.mkdirSync(dir, { recursive: true });
    const records = Array.from(this.statuses.values());
    fs.writeFileSync(this.storePath, JSON.stringify(records, null, 2), 'utf-8');
  }

  create(customerId: string, tenantId: string): OnboardingStatus {
    const now = new Date().toISOString();
    const status: OnboardingStatus = {
      customerId,
      tenantId,
      stage: 'inquiry',
      progress: 0,
      description: STAGE_DESCRIPTIONS.inquiry,
      startedAt: now,
      updatedAt: now,
      stageHistory: [{ stage: 'inquiry', enteredAt: now, message: 'Onboarding started' }],
      errors: [],
      estimatedMinutesRemaining: 15,
    };
    this.statuses.set(customerId, status);
    this.save();
    return status;
  }

  advance(customerId: string, nextStage: OnboardingStage, message?: string): OnboardingStatus {
    const status = this.statuses.get(customerId);
    if (!status) throw new Error(`No onboarding status found for customer: ${customerId}`);

    const now = new Date().toISOString();
    const progress = STAGE_PROGRESS[nextStage];

    const updated: OnboardingStatus = {
      ...status,
      stage: nextStage,
      progress,
      description: STAGE_DESCRIPTIONS[nextStage],
      updatedAt: now,
      stageHistory: [
        ...status.stageHistory,
        { stage: nextStage, enteredAt: now, message: message ?? STAGE_DESCRIPTIONS[nextStage] },
      ],
      completedAt: nextStage === 'live' ? now : undefined,
      estimatedMinutesRemaining: this.estimateRemaining(nextStage),
    };

    this.statuses.set(customerId, updated);
    this.save();
    return updated;
  }

  setInstanceUrl(customerId: string, instanceUrl: string): OnboardingStatus {
    const status = this.statuses.get(customerId);
    if (!status) throw new Error(`No onboarding status found: ${customerId}`);
    const updated = { ...status, instanceUrl, updatedAt: new Date().toISOString() };
    this.statuses.set(customerId, updated);
    this.save();
    return updated;
  }

  addError(customerId: string, error: string): OnboardingStatus {
    const status = this.statuses.get(customerId);
    if (!status) throw new Error(`No onboarding status found: ${customerId}`);
    const updated = {
      ...status,
      errors: [...status.errors, `[${new Date().toISOString()}] ${error}`],
      updatedAt: new Date().toISOString(),
    };
    this.statuses.set(customerId, updated);
    this.save();
    return updated;
  }

  get(customerId: string): OnboardingStatus | undefined {
    return this.statuses.get(customerId);
  }

  getByTenantId(tenantId: string): OnboardingStatus | undefined {
    return Array.from(this.statuses.values()).find(s => s.tenantId === tenantId);
  }

  list(): OnboardingStatus[] {
    return Array.from(this.statuses.values());
  }

  private estimateRemaining(stage: OnboardingStage): number {
    const estimates: Record<OnboardingStage, number> = {
      inquiry: 15,
      questionnaire: 12,
      provisioning: 8,
      deploying: 3,
      live: 0,
    };
    return estimates[stage];
  }

  // Express/HTTP compatible — returns status object for API responses
  toApiResponse(status: OnboardingStatus): Record<string, unknown> {
    return {
      customerId: status.customerId,
      tenantId: status.tenantId,
      stage: status.stage,
      progress: status.progress,
      description: status.description,
      startedAt: status.startedAt,
      updatedAt: status.updatedAt,
      completedAt: status.completedAt,
      instanceUrl: status.instanceUrl,
      estimatedMinutesRemaining: status.estimatedMinutesRemaining,
      history: status.stageHistory,
      hasErrors: status.errors.length > 0,
    };
  }
}
