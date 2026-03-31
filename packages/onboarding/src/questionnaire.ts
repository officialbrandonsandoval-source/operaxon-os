// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * questionnaire.ts — Pre-deployment survey
 * Captures everything we need to provision a customer's Operaxon OS instance.
 */

import { CustomerTier } from './customer.js';

// ─── Channel types supported ──────────────────────────────────────────────────

export type ChannelType = 'telegram' | 'discord' | 'slack' | 'signal' | 'webhook' | 'email';

// ─── Agent types available ────────────────────────────────────────────────────

export type AgentType =
  | 'governing'       // Dominus-class: orchestrates all others
  | 'builder'         // Praxis-class: code, deployments
  | 'communications'  // Hermes-class: outbound comms, social
  | 'research'        // Sophia-class: intelligence, analysis
  | 'sales'           // Legatus-class: outreach, CRM
  | 'trading'         // Aurum-class: markets, signals
  | 'legal'           // Lex-class: contracts, compliance
  | 'custom';         // customer-defined role

// ─── Integration options ──────────────────────────────────────────────────────

export type IntegrationType =
  | 'github'
  | 'notion'
  | 'airtable'
  | 'hubspot'
  | 'salesforce'
  | 'stripe'
  | 'twilio'
  | 'sendgrid'
  | 'zapier'
  | 'custom_webhook';

// ─── SLA tier ─────────────────────────────────────────────────────────────────

export type SLATier = 'standard' | 'priority' | 'enterprise';

// ─── Questionnaire response ───────────────────────────────────────────────────

export interface QuestionnaireResponse {
  // Metadata
  customerId: string;
  completedAt: string;        // ISO 8601
  version: string;            // questionnaire version for schema migrations

  // Business context
  businessName: string;
  industry: string;
  teamSize: number;
  primaryUseCase: string;     // 1-2 sentences: what they want the agents to do
  currentTools: string[];     // tools they currently use (CRM, email, etc.)

  // Tier selection
  selectedTier: CustomerTier;

  // Agent configuration
  agents: AgentRequest[];

  // Channels
  channels: ChannelRequest[];

  // Integrations
  integrations: IntegrationRequest[];

  // Principal (who controls the agents)
  principalName: string;      // the human in charge
  principalContact: string;   // e.g. "telegram:+15551234567"
  principalEmail: string;

  // Memory + data
  memoryStoragePath: string;  // default: "meridian/{tenantId}"
  dataRetentionDays: number;  // default 90

  // Compliance
  requiresAuditLog: boolean;
  dataRegion: 'us' | 'eu' | 'asia' | 'any';

  // SLA
  slaTier: SLATier;
  deploymentTarget: 'fly.io' | 'railway' | 'self-hosted';

  // Additional notes
  specialRequirements: string;
}

export interface AgentRequest {
  type: AgentType;
  name: string;                 // customer-facing name, e.g. "Max" or "Aria"
  role: string;                 // one-liner role description
  model: 'haiku' | 'sonnet' | 'opus';
  domains: string[];            // business domains this agent operates in
  autonomyLevel: 'supervised' | 'semi-autonomous' | 'autonomous';
  tools: string[];              // tools this agent needs access to
}

export interface ChannelRequest {
  type: ChannelType;
  enabled: boolean;
  purpose: string;             // "customer support", "internal alerts", etc.
  credentialsProvided: boolean; // customer confirms they'll provide credentials
}

export interface IntegrationRequest {
  type: IntegrationType;
  enabled: boolean;
  purpose: string;
  credentialsProvided: boolean;
}

// ─── Sample questionnaire for first customer ─────────────────────────────────

export function createSampleQuestionnaire(customerId: string): QuestionnaireResponse {
  return {
    customerId,
    completedAt: new Date().toISOString(),
    version: '1.0.0',

    businessName: 'Acme Corp',
    industry: 'E-commerce',
    teamSize: 12,
    primaryUseCase:
      'Automate customer support responses, monitor social media, and generate weekly business intelligence reports.',
    currentTools: ['HubSpot', 'Slack', 'Notion', 'Shopify'],

    selectedTier: 'business',

    agents: [
      {
        type: 'governing',
        name: 'Atlas',
        role: 'Governing intelligence — coordinates all agents and holds business context',
        model: 'sonnet',
        domains: ['operations', 'strategy'],
        autonomyLevel: 'semi-autonomous',
        tools: ['read_memory', 'write_memory', 'delegate', 'notify'],
      },
      {
        type: 'communications',
        name: 'Iris',
        role: 'Handles all customer-facing communication and social media',
        model: 'sonnet',
        domains: ['customer_support', 'social_media'],
        autonomyLevel: 'supervised',
        tools: ['send_message', 'read_channel', 'draft_content'],
      },
      {
        type: 'research',
        name: 'Oracle',
        role: 'Business intelligence and competitive analysis',
        model: 'sonnet',
        domains: ['research', 'analytics', 'reporting'],
        autonomyLevel: 'autonomous',
        tools: ['web_search', 'read_memory', 'write_report'],
      },
    ],

    channels: [
      { type: 'telegram', enabled: true, purpose: 'Principal notifications and control', credentialsProvided: true },
      { type: 'slack', enabled: true, purpose: 'Team internal alerts', credentialsProvided: true },
      { type: 'webhook', enabled: true, purpose: 'Shopify order events', credentialsProvided: true },
    ],

    integrations: [
      { type: 'hubspot', enabled: true, purpose: 'CRM sync for lead tracking', credentialsProvided: true },
      { type: 'notion', enabled: true, purpose: 'Write reports to team workspace', credentialsProvided: true },
    ],

    principalName: 'Jane Smith',
    principalContact: 'telegram:+15551234567',
    principalEmail: 'jane@acmecorp.com',

    memoryStoragePath: 'meridian/acmecorp',
    dataRetentionDays: 90,
    requiresAuditLog: true,
    dataRegion: 'us',

    slaTier: 'priority',
    deploymentTarget: 'fly.io',

    specialRequirements:
      'All agents must respond in under 5 seconds. Audit log required for all financial decisions.',
  };
}

// ─── Questionnaire validator ──────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateQuestionnaire(q: QuestionnaireResponse): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!q.customerId) errors.push('customerId is required');
  if (!q.businessName) errors.push('businessName is required');
  if (!q.principalName) errors.push('principalName is required');
  if (!q.principalContact) errors.push('principalContact is required');
  if (!q.principalEmail) errors.push('principalEmail is required');

  if (q.agents.length === 0) {
    errors.push('At least one agent is required');
  }

  const governingAgents = q.agents.filter(a => a.type === 'governing');
  if (governingAgents.length === 0) {
    warnings.push('No governing agent defined — one will be created automatically');
  }
  if (governingAgents.length > 1) {
    errors.push('Only one governing agent is allowed per tenant');
  }

  if (q.channels.length === 0) {
    warnings.push('No channels configured — principal will only be reachable via API');
  }

  const enabledChannels = q.channels.filter(c => c.enabled);
  const missingCreds = enabledChannels.filter(c => !c.credentialsProvided);
  if (missingCreds.length > 0) {
    warnings.push(`Missing credentials for: ${missingCreds.map(c => c.type).join(', ')}`);
  }

  if (!q.selectedTier) errors.push('selectedTier is required');
  if (!q.deploymentTarget) errors.push('deploymentTarget is required');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
