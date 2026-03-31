// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * components.ts — React component stubs for the customer dashboard UI
 *
 * These are type definitions and component signatures.
 * The actual React implementation is in the frontend (Next.js / Vite).
 * This file documents the props contract so the frontend team can build to spec.
 *
 * Stack: React 18 + TypeScript + TailwindCSS + ShadCN UI
 * API: All data fetched from /dashboard/* endpoints via Authorization: Bearer header
 */

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface DashboardUser {
  tenantId: string;
  customerId: string;
  email: string;
  role: 'owner' | 'viewer';
}

// ─── AgentsPanel ──────────────────────────────────────────────────────────────
// Fetches: GET /dashboard/agents
// Shows: agent name, role, status, last active, task count

export interface AgentRow {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'active' | 'consolidating' | 'suspended' | 'error';
  model: string;
  lastActive?: string;
  tasksCompleted?: number;
  tasksFailed?: number;
  avgResponseMs?: number;
}

export interface AgentsPanelProps {
  user: DashboardUser;
  onSelectAgent: (agentId: string) => void;
}

// Component renders:
// - Table: Name | Role | Status | Model | Last Active | Tasks
// - Status badges: green (idle/active), yellow (consolidating), red (error)
// - Click row → opens AgentDetail sheet
// - Refresh button (re-fetches every 30s by default)

// ─── MemoryBrowser ────────────────────────────────────────────────────────────
// Fetches: GET /dashboard/memory + GET /dashboard/memory/search?q=

export interface MemoryBrowserProps {
  user: DashboardUser;
}

// Component renders:
// - Search input (min 2 chars)
// - Results list: key + snippet
// - Memory key count + storage stats
// - Click key → fetch full value via GET /dashboard/memory/keys/:key (future)

// ─── AuditLog ─────────────────────────────────────────────────────────────────
// Fetches: GET /dashboard/audit?date=YYYY-MM-DD

export interface AuditEntry {
  timestamp: string;
  tenantId: string;
  actor: string;
  action: string;
  resource: string;
  outcome: 'success' | 'failure' | 'pending';
  metadata?: Record<string, unknown>;
}

export interface AuditLogProps {
  user: DashboardUser;
  defaultDate?: string;     // defaults to today
}

// Component renders:
// - Date picker (nav between days)
// - Table: Timestamp | Actor | Action | Resource | Outcome
// - Filter by outcome
// - Export CSV button

// ─── UsageMetrics ─────────────────────────────────────────────────────────────
// Fetches: GET /dashboard/usage

export interface UsageMetricsProps {
  user: DashboardUser;
}

// Component renders:
// - Cards: API Calls | Messages | Consolidations | Avg Response Time
// - Progress bars vs plan limits
// - Period selector (last 3 months)
// - Usage trend chart (simple line or bar)

// ─── BillingPanel ─────────────────────────────────────────────────────────────
// Fetches: GET /dashboard/billing

export interface BillingPanelProps {
  user: DashboardUser;
  tier: 'solo' | 'business' | 'enterprise';
}

// Component renders:
// - Current tier badge + pricing
// - Current period usage
// - Invoice list (if any)
// - Upgrade CTA (solo → business, business → enterprise)
// - Add payment method button → redirect to Stripe hosted page

// ─── SettingsPanel ────────────────────────────────────────────────────────────
// Uses: PUT /dashboard/settings/channels

export interface ChannelSetting {
  type: string;
  enabled: boolean;
  purpose: string;
}

export interface SettingsPanelProps {
  user: DashboardUser;
}

// Component renders:
// - Channel toggles (Telegram, Discord, Slack, etc.)
// - Webhook URL config
// - Agent persona settings (name, avatar)
// - Danger zone: suspend instance, request deletion

// ─── Dashboard layout ─────────────────────────────────────────────────────────

export interface DashboardLayoutProps {
  user: DashboardUser;
  activeTab: 'agents' | 'memory' | 'audit' | 'usage' | 'billing' | 'settings';
  onTabChange: (tab: DashboardLayoutProps['activeTab']) => void;
}

// Sidebar nav:
// ▪ Agents (brain icon)
// ▪ Memory (database icon)
// ▪ Audit Log (clock icon)
// ▪ Usage (chart icon)
// ▪ Billing (credit card icon)
// ▪ Settings (gear icon)

// ─── Authentication flow ──────────────────────────────────────────────────────

export interface LoginPageProps {
  onSuccess: (user: DashboardUser) => void;
}

// Component renders:
// - API key input (masked)
// - Login button
// - Calls POST /dashboard/auth/verify internally
// - On success: stores in sessionStorage, redirects to /dashboard
// - Error states: invalid key, expired, revoked

// ─── Export stubs for documentation (no runtime exports needed) ───────────────
export const UI_COMPONENTS = [
  'AgentsPanel',
  'MemoryBrowser',
  'AuditLog',
  'UsageMetrics',
  'BillingPanel',
  'SettingsPanel',
  'DashboardLayout',
  'LoginPage',
] as const;

export type UIComponent = typeof UI_COMPONENTS[number];
