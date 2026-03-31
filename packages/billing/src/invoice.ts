// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * invoice.ts — Generate invoices from usage + tier
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getTier, BillingTier } from './tier.js';
import { UsageRecord } from './usage.js';

// ─── Invoice types ────────────────────────────────────────────────────────────

export type InvoiceStatus = 'draft' | 'pending' | 'paid' | 'failed' | 'void';

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface Invoice {
  id: string;                   // "inv_abc123"
  tenantId: string;
  customerId: string;
  period: string;               // "2026-03"
  status: InvoiceStatus;

  lineItems: InvoiceLineItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;

  billingEmail: string;
  stripeInvoiceId?: string;     // set after Stripe creation
  paidAt?: string;

  generatedAt: string;
  dueDate: string;              // net-7 by default
}

// ─── InvoiceGenerator ────────────────────────────────────────────────────────

export class InvoiceGenerator {
  private storePath: string;
  private invoices: Map<string, Invoice> = new Map();

  constructor(storePath: string) {
    this.storePath = storePath;
    this.load();
  }

  private load(): void {
    if (fs.existsSync(this.storePath)) {
      const records: Invoice[] = JSON.parse(fs.readFileSync(this.storePath, 'utf-8'));
      for (const inv of records) {
        this.invoices.set(inv.id, inv);
      }
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify(Array.from(this.invoices.values()), null, 2), 'utf-8');
  }

  // ─── Generate invoice ─────────────────────────────────────────────────────────

  generate(opts: {
    tenantId: string;
    customerId: string;
    tier: BillingTier;
    usage: UsageRecord;
    billingEmail: string;
    isFirstMonth?: boolean;
    dryRun?: boolean;
  }): Invoice {
    const tierDef = getTier(opts.tier);
    const lineItems: InvoiceLineItem[] = [];

    // Setup fee (first invoice only)
    if (opts.isFirstMonth) {
      lineItems.push({
        description: `Operaxon OS ${tierDef.name} — Setup Fee`,
        quantity: 1,
        unitPriceCents: tierDef.setupFeeCents,
        totalCents: tierDef.setupFeeCents,
      });
    }

    // Monthly subscription
    lineItems.push({
      description: `Operaxon OS ${tierDef.name} — Monthly Subscription (${opts.usage.period})`,
      quantity: 1,
      unitPriceCents: tierDef.monthlyFeeCents,
      totalCents: tierDef.monthlyFeeCents,
    });

    // Overage: API calls (if applicable)
    if (tierDef.apiCallsPerMonth !== -1 && opts.usage.apiCallsTotal > tierDef.apiCallsPerMonth) {
      const overage = opts.usage.apiCallsTotal - tierDef.apiCallsPerMonth;
      const overageCentsPerCall = 1; // $0.01 per extra API call
      lineItems.push({
        description: `API Call Overage — ${overage.toLocaleString()} calls over limit`,
        quantity: overage,
        unitPriceCents: overageCentsPerCall,
        totalCents: overage * overageCentsPerCall,
      });
    }

    // Overage: messages
    if (tierDef.messagesPerMonth !== -1 && opts.usage.messagesProcessed > tierDef.messagesPerMonth) {
      const overage = opts.usage.messagesProcessed - tierDef.messagesPerMonth;
      const overageCentsPerMsg = 2; // $0.02 per extra message
      lineItems.push({
        description: `Message Overage — ${overage.toLocaleString()} messages over limit`,
        quantity: overage,
        unitPriceCents: overageCentsPerMsg,
        totalCents: overage * overageCentsPerMsg,
      });
    }

    const subtotalCents = lineItems.reduce((sum, item) => sum + item.totalCents, 0);
    const taxCents = 0; // tax calculation varies by jurisdiction — handled at Stripe level
    const totalCents = subtotalCents + taxCents;

    // Due date: net-7
    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const invoice: Invoice = {
      id: `inv_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      tenantId: opts.tenantId,
      customerId: opts.customerId,
      period: opts.usage.period,
      status: opts.dryRun ? 'draft' : 'pending',
      lineItems,
      subtotalCents,
      taxCents,
      totalCents,
      billingEmail: opts.billingEmail,
      generatedAt: new Date().toISOString(),
      dueDate,
    };

    if (!opts.dryRun) {
      this.invoices.set(invoice.id, invoice);
      this.save();
    }

    return invoice;
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────────

  get(invoiceId: string): Invoice | undefined {
    return this.invoices.get(invoiceId);
  }

  listByTenant(tenantId: string): Invoice[] {
    return Array.from(this.invoices.values()).filter(inv => inv.tenantId === tenantId);
  }

  markPaid(invoiceId: string, stripeInvoiceId?: string): Invoice {
    const inv = this.invoices.get(invoiceId);
    if (!inv) throw new Error(`Invoice not found: ${invoiceId}`);
    const updated: Invoice = {
      ...inv,
      status: 'paid',
      paidAt: new Date().toISOString(),
      stripeInvoiceId: stripeInvoiceId ?? inv.stripeInvoiceId,
    };
    this.invoices.set(invoiceId, updated);
    this.save();
    return updated;
  }

  // ─── Human-readable summary ───────────────────────────────────────────────────

  formatInvoice(invoice: Invoice): string {
    const lines: string[] = [
      `Invoice ${invoice.id}`,
      `Tenant: ${invoice.tenantId}`,
      `Period: ${invoice.period}`,
      `Status: ${invoice.status.toUpperCase()}`,
      `Due: ${invoice.dueDate}`,
      ``,
      `Line Items:`,
      ...invoice.lineItems.map(
        item => `  ${item.description}: $${(item.totalCents / 100).toFixed(2)}`
      ),
      ``,
      `Subtotal: $${(invoice.subtotalCents / 100).toFixed(2)}`,
      `Total: $${(invoice.totalCents / 100).toFixed(2)}`,
    ];
    return lines.join('\n');
  }
}
