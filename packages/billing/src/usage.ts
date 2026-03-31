// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * usage.ts — Track API calls, message volume, consolidation runs per tenant
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Usage record ─────────────────────────────────────────────────────────────

export interface UsageRecord {
  tenantId: string;
  period: string;               // "2026-03" (year-month)

  // API usage
  apiCallsTotal: number;
  apiCallsByEndpoint: Record<string, number>;

  // Messaging
  messagesProcessed: number;
  messagesByChannel: Record<string, number>;

  // Memory
  consolidationsRun: number;
  memorySnippetsStored: number;
  memorySearches: number;

  // Agents
  agentTasksCompleted: number;
  agentTasksFailed: number;
  totalAgentResponseMs: number;  // for average calculation

  // Governance
  governorDecisions: number;
  approvalRequestsSent: number;
  approvalRequestsGranted: number;

  // Timestamps
  firstEventAt?: string;
  lastEventAt: string;
}

// ─── UsageTracker ─────────────────────────────────────────────────────────────

export class UsageTracker {
  private baseDir: string;
  private cache: Map<string, UsageRecord> = new Map();

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  private key(tenantId: string, period: string): string {
    return `${tenantId}:${period}`;
  }

  private currentPeriod(): string {
    return new Date().toISOString().slice(0, 7); // "2026-03"
  }

  private filePath(tenantId: string, period: string): string {
    const dir = path.join(this.baseDir, tenantId);
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `usage-${period}.json`);
  }

  // Load usage record for a period (creates fresh if not exists)
  private load(tenantId: string, period: string): UsageRecord {
    const cacheKey = this.key(tenantId, period);
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

    const filePath = this.filePath(tenantId, period);
    if (fs.existsSync(filePath)) {
      const record = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as UsageRecord;
      this.cache.set(cacheKey, record);
      return record;
    }

    const fresh: UsageRecord = {
      tenantId,
      period,
      apiCallsTotal: 0,
      apiCallsByEndpoint: {},
      messagesProcessed: 0,
      messagesByChannel: {},
      consolidationsRun: 0,
      memorySnippetsStored: 0,
      memorySearches: 0,
      agentTasksCompleted: 0,
      agentTasksFailed: 0,
      totalAgentResponseMs: 0,
      governorDecisions: 0,
      approvalRequestsSent: 0,
      approvalRequestsGranted: 0,
      lastEventAt: new Date().toISOString(),
    };

    this.cache.set(cacheKey, fresh);
    return fresh;
  }

  private persist(record: UsageRecord): void {
    const filePath = this.filePath(record.tenantId, record.period);
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
    this.cache.set(this.key(record.tenantId, record.period), record);
  }

  // ─── Track events ─────────────────────────────────────────────────────────────

  trackApiCall(tenantId: string, endpoint: string): void {
    const period = this.currentPeriod();
    const record = this.load(tenantId, period);
    record.apiCallsTotal++;
    record.apiCallsByEndpoint[endpoint] = (record.apiCallsByEndpoint[endpoint] ?? 0) + 1;
    record.lastEventAt = new Date().toISOString();
    if (!record.firstEventAt) record.firstEventAt = record.lastEventAt;
    this.persist(record);
  }

  trackMessage(tenantId: string, channel: string): void {
    const period = this.currentPeriod();
    const record = this.load(tenantId, period);
    record.messagesProcessed++;
    record.messagesByChannel[channel] = (record.messagesByChannel[channel] ?? 0) + 1;
    record.lastEventAt = new Date().toISOString();
    this.persist(record);
  }

  trackConsolidation(tenantId: string): void {
    const period = this.currentPeriod();
    const record = this.load(tenantId, period);
    record.consolidationsRun++;
    record.lastEventAt = new Date().toISOString();
    this.persist(record);
  }

  trackMemoryWrite(tenantId: string): void {
    const period = this.currentPeriod();
    const record = this.load(tenantId, period);
    record.memorySnippetsStored++;
    record.lastEventAt = new Date().toISOString();
    this.persist(record);
  }

  trackMemorySearch(tenantId: string): void {
    const period = this.currentPeriod();
    const record = this.load(tenantId, period);
    record.memorySearches++;
    record.lastEventAt = new Date().toISOString();
    this.persist(record);
  }

  trackAgentTask(tenantId: string, success: boolean, responseMs: number): void {
    const period = this.currentPeriod();
    const record = this.load(tenantId, period);
    if (success) {
      record.agentTasksCompleted++;
    } else {
      record.agentTasksFailed++;
    }
    record.totalAgentResponseMs += responseMs;
    record.lastEventAt = new Date().toISOString();
    this.persist(record);
  }

  trackGovernorDecision(tenantId: string): void {
    const period = this.currentPeriod();
    const record = this.load(tenantId, period);
    record.governorDecisions++;
    record.lastEventAt = new Date().toISOString();
    this.persist(record);
  }

  // ─── Read ────────────────────────────────────────────────────────────────────

  getCurrent(tenantId: string): UsageRecord {
    return this.load(tenantId, this.currentPeriod());
  }

  getPeriod(tenantId: string, period: string): UsageRecord {
    return this.load(tenantId, period);
  }

  getAverageResponseMs(tenantId: string): number {
    const record = this.getCurrent(tenantId);
    const totalTasks = record.agentTasksCompleted + record.agentTasksFailed;
    if (totalTasks === 0) return 0;
    return Math.round(record.totalAgentResponseMs / totalTasks);
  }

  // All usage periods for a tenant
  listPeriods(tenantId: string): string[] {
    const dir = path.join(this.baseDir, tenantId);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => f.startsWith('usage-') && f.endsWith('.json'))
      .map(f => f.replace('usage-', '').replace('.json', ''))
      .sort();
  }
}
