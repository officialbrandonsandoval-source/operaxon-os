// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * customer.ts — Customer profile model
 * Defines the full shape of a customer record from inquiry to live.
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Tier definitions ─────────────────────────────────────────────────────────

export type CustomerTier = 'solo' | 'business' | 'enterprise';

export interface TierPricing {
  tier: CustomerTier;
  setupFee: number;       // one-time USD cents
  monthlyFee: number;     // monthly USD cents
  description: string;
  agentLimit: number;
  channelLimit: number;
  memoryLimitMB: number;
  slaHours: number;       // response SLA in hours
}

export const TIER_PRICING: Record<CustomerTier, TierPricing> = {
  solo: {
    tier: 'solo',
    setupFee: 99700,         // $997
    monthlyFee: 99700,       // $997/mo
    description: '1 governing agent + 2 sub-agents, 2 channels, 1GB memory, 48h SLA',
    agentLimit: 3,
    channelLimit: 2,
    memoryLimitMB: 1024,
    slaHours: 48,
  },
  business: {
    tier: 'business',
    setupFee: 199700,        // $1,997
    monthlyFee: 199700,      // $1,997/mo
    description: '1 governing agent + 5 sub-agents, 5 channels, 5GB memory, 24h SLA',
    agentLimit: 6,
    channelLimit: 5,
    memoryLimitMB: 5120,
    slaHours: 24,
  },
  enterprise: {
    tier: 'enterprise',
    setupFee: 500000,        // $5,000 (minimum)
    monthlyFee: 250000,      // $2,500/mo (minimum)
    description: 'Unlimited agents and channels, custom memory, 4h SLA, dedicated support',
    agentLimit: -1,           // unlimited
    channelLimit: -1,         // unlimited
    memoryLimitMB: -1,        // unlimited
    slaHours: 4,
  },
};

// ─── Customer status ──────────────────────────────────────────────────────────

export type CustomerStatus =
  | 'inquiry'         // just submitted interest
  | 'questionnaire'   // filling out questionnaire
  | 'provisioning'    // config being generated
  | 'deploying'       // instance being spun up
  | 'live'            // active and running
  | 'suspended'       // billing issue or violation
  | 'churned';        // cancelled

// ─── Customer profile ─────────────────────────────────────────────────────────

export interface CustomerProfile {
  id: string;                   // e.g. "cust_abc123"
  tenantId: string;             // e.g. "tenant_abc123" — maps to deployment
  createdAt: string;            // ISO 8601
  updatedAt: string;

  // Identity
  name: string;
  email: string;
  company: string;
  phone?: string;

  // Business
  tier: CustomerTier;
  status: CustomerStatus;

  // Billing
  stripeCustomerId?: string;    // set after Stripe customer created
  billingEmail: string;
  setupFeePaid: boolean;
  monthlyFeePaid: boolean;
  nextBillingDate?: string;     // ISO 8601

  // Instance
  instanceUrl?: string;         // e.g. "https://operaxon-cust-abc123.fly.io"
  apiKey?: string;              // customer's API key for dashboard
  instancePort?: number;        // port if local/self-hosted

  // Metadata
  notes: string;
  tags: string[];
}

// ─── CustomerStore ────────────────────────────────────────────────────────────

export class CustomerStore {
  private storePath: string;
  private customers: Map<string, CustomerProfile> = new Map();

  constructor(storePath: string) {
    this.storePath = storePath;
    this.load();
  }

  private load(): void {
    if (fs.existsSync(this.storePath)) {
      const raw = fs.readFileSync(this.storePath, 'utf-8');
      const records: CustomerProfile[] = JSON.parse(raw);
      for (const c of records) {
        this.customers.set(c.id, c);
      }
    }
  }

  private save(): void {
    const dir = path.dirname(this.storePath);
    fs.mkdirSync(dir, { recursive: true });
    const records = Array.from(this.customers.values());
    fs.writeFileSync(this.storePath, JSON.stringify(records, null, 2), 'utf-8');
  }

  create(input: Omit<CustomerProfile, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): CustomerProfile {
    const now = new Date().toISOString();
    const id = `cust_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const tenantId = `tenant_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

    const customer: CustomerProfile = {
      ...input,
      id,
      tenantId,
      createdAt: now,
      updatedAt: now,
    };

    this.customers.set(id, customer);
    this.save();
    return customer;
  }

  get(id: string): CustomerProfile | undefined {
    return this.customers.get(id);
  }

  getByTenantId(tenantId: string): CustomerProfile | undefined {
    return Array.from(this.customers.values()).find(c => c.tenantId === tenantId);
  }

  getByEmail(email: string): CustomerProfile | undefined {
    return Array.from(this.customers.values()).find(c => c.email === email);
  }

  update(id: string, patch: Partial<CustomerProfile>): CustomerProfile {
    const existing = this.customers.get(id);
    if (!existing) throw new Error(`Customer not found: ${id}`);

    const updated: CustomerProfile = {
      ...existing,
      ...patch,
      id: existing.id,                  // immutable
      tenantId: existing.tenantId,      // immutable
      createdAt: existing.createdAt,    // immutable
      updatedAt: new Date().toISOString(),
    };

    this.customers.set(id, updated);
    this.save();
    return updated;
  }

  updateStatus(id: string, status: CustomerStatus): CustomerProfile {
    return this.update(id, { status });
  }

  list(filter?: { status?: CustomerStatus; tier?: CustomerTier }): CustomerProfile[] {
    let results = Array.from(this.customers.values());
    if (filter?.status) results = results.filter(c => c.status === filter.status);
    if (filter?.tier) results = results.filter(c => c.tier === filter.tier);
    return results;
  }

  count(): number {
    return this.customers.size;
  }
}
