// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * tier.ts — Billing tier definitions and validation
 */

export type BillingTier = 'solo' | 'business' | 'enterprise';

export interface TierDefinition {
  tier: BillingTier;
  name: string;
  setupFeeCents: number;
  monthlyFeeCents: number;
  description: string;

  // Limits
  agentLimit: number;         // -1 = unlimited
  channelLimit: number;
  memoryLimitMB: number;
  apiCallsPerMonth: number;   // -1 = unlimited
  messagesPerMonth: number;   // -1 = unlimited

  // SLA
  slaHours: number;           // response time guarantee
  uptimePercent: number;      // e.g. 99.9

  // Features
  features: string[];
}

export const TIERS: Record<BillingTier, TierDefinition> = {
  solo: {
    tier: 'solo',
    name: 'Solo',
    setupFeeCents: 99700,
    monthlyFeeCents: 99700,
    description: 'For solopreneurs and small teams. One governing agent, two sub-agents.',
    agentLimit: 3,
    channelLimit: 2,
    memoryLimitMB: 1024,
    apiCallsPerMonth: 10000,
    messagesPerMonth: 5000,
    slaHours: 48,
    uptimePercent: 99.0,
    features: [
      '1 governing agent + 2 sub-agents',
      '2 communication channels',
      '1GB agent memory (MERIDIAN)',
      '10K API calls/month',
      'Audit log (90-day retention)',
      '48-hour support SLA',
      'Fly.io deployment',
    ],
  },
  business: {
    tier: 'business',
    name: 'Business',
    setupFeeCents: 199700,
    monthlyFeeCents: 199700,
    description: 'For growing teams. Full agent suite, more channels, priority support.',
    agentLimit: 6,
    channelLimit: 5,
    memoryLimitMB: 5120,
    apiCallsPerMonth: 50000,
    messagesPerMonth: 25000,
    slaHours: 24,
    uptimePercent: 99.5,
    features: [
      '1 governing agent + 5 sub-agents',
      '5 communication channels',
      '5GB agent memory (MERIDIAN)',
      '50K API calls/month',
      'Audit log (1-year retention)',
      '24-hour support SLA',
      'Custom agent personas',
      'Fly.io + Railway deployment',
      'Billing dashboard',
    ],
  },
  enterprise: {
    tier: 'enterprise',
    name: 'Enterprise',
    setupFeeCents: 500000,   // $5,000 setup (minimum)
    monthlyFeeCents: 250000, // $2,500/month (minimum)
    description: 'For large organizations. Unlimited agents, dedicated support, custom SLA.',
    agentLimit: -1,
    channelLimit: -1,
    memoryLimitMB: -1,
    apiCallsPerMonth: -1,
    messagesPerMonth: -1,
    slaHours: 4,
    uptimePercent: 99.9,
    features: [
      'Unlimited agents and channels',
      'Unlimited memory',
      'Unlimited API calls',
      'Custom agent personas and training',
      '4-hour support SLA',
      'Dedicated customer success manager',
      'Custom integrations',
      'Self-hosted deployment option',
      'SOC 2 compliance package',
      'Custom contract and SLA',
    ],
  },
};

export function getTier(tier: BillingTier): TierDefinition {
  return TIERS[tier];
}

export function isWithinLimits(
  tier: BillingTier,
  usage: { agents?: number; channels?: number; memoryMB?: number; apiCalls?: number }
): { allowed: boolean; violations: string[] } {
  const def = TIERS[tier];
  const violations: string[] = [];

  if (usage.agents !== undefined && def.agentLimit !== -1 && usage.agents > def.agentLimit) {
    violations.push(`Agent limit exceeded: ${usage.agents}/${def.agentLimit}`);
  }
  if (usage.channels !== undefined && def.channelLimit !== -1 && usage.channels > def.channelLimit) {
    violations.push(`Channel limit exceeded: ${usage.channels}/${def.channelLimit}`);
  }
  if (usage.memoryMB !== undefined && def.memoryLimitMB !== -1 && usage.memoryMB > def.memoryLimitMB) {
    violations.push(`Memory limit exceeded: ${usage.memoryMB}MB/${def.memoryLimitMB}MB`);
  }
  if (usage.apiCalls !== undefined && def.apiCallsPerMonth !== -1 && usage.apiCalls > def.apiCallsPerMonth) {
    violations.push(`API call limit exceeded: ${usage.apiCalls}/${def.apiCallsPerMonth}`);
  }

  return { allowed: violations.length === 0, violations };
}
