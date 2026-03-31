// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * stripe.ts — Stripe integration stub
 * Ready for real Stripe API. Swap STRIPE_SECRET_KEY in .env and set dryRun=false.
 *
 * All methods are async and signature-compatible with the real Stripe SDK.
 * Integration test mode: calls are logged but no real charges made.
 */

import * as https from 'node:https';
import { Invoice } from './invoice.js';

// ─── Stripe types ─────────────────────────────────────────────────────────────

export interface StripeCustomer {
  id: string;                   // "cus_..."
  email: string;
  name: string;
  metadata: Record<string, string>;
}

export interface StripePaymentMethod {
  id: string;                   // "pm_..."
  type: 'card' | 'bank_account';
  last4?: string;
  brand?: string;
}

export interface StripeInvoice {
  id: string;                   // "in_..."
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  amountDue: number;            // cents
  amountPaid: number;           // cents
  hostedInvoiceUrl?: string;
  pdfUrl?: string;
}

export interface StripeCharge {
  id: string;                   // "ch_..."
  status: 'succeeded' | 'pending' | 'failed';
  amountCents: number;
  currency: string;
}

export interface StripeConfig {
  secretKey: string;
  dryRun?: boolean;             // if true, log calls but don't hit Stripe
  webhookSecret?: string;
}

// ─── StripeClient ─────────────────────────────────────────────────────────────

export class StripeClient {
  private config: StripeConfig;
  private baseUrl = 'https://api.stripe.com/v1';

  constructor(config: StripeConfig) {
    this.config = config;
    if (!config.secretKey && !config.dryRun) {
      throw new Error('STRIPE_SECRET_KEY is required when dryRun=false');
    }
  }

  // ─── Customer management ──────────────────────────────────────────────────────

  async createCustomer(opts: {
    email: string;
    name: string;
    tenantId: string;
    customerId: string;
  }): Promise<StripeCustomer> {
    if (this.config.dryRun) {
      console.log(`[Stripe DRY-RUN] createCustomer: ${opts.email} (${opts.name})`);
      return {
        id: `cus_dry_${opts.customerId}`,
        email: opts.email,
        name: opts.name,
        metadata: { tenantId: opts.tenantId, operaxonCustomerId: opts.customerId },
      };
    }

    const params = new URLSearchParams({
      email: opts.email,
      name: opts.name,
      'metadata[tenantId]': opts.tenantId,
      'metadata[operaxonCustomerId]': opts.customerId,
    });

    const response = await this.post('/customers', params.toString());
    return {
      id: response.id,
      email: response.email,
      name: response.name,
      metadata: response.metadata,
    };
  }

  // ─── Invoice creation ─────────────────────────────────────────────────────────

  async createInvoice(opts: {
    stripeCustomerId: string;
    invoice: Invoice;
  }): Promise<StripeInvoice> {
    if (this.config.dryRun) {
      console.log(`[Stripe DRY-RUN] createInvoice: $${(opts.invoice.totalCents / 100).toFixed(2)} for ${opts.stripeCustomerId}`);
      return {
        id: `in_dry_${opts.invoice.id}`,
        status: 'draft',
        amountDue: opts.invoice.totalCents,
        amountPaid: 0,
        hostedInvoiceUrl: `https://invoice.stripe.com/dry-run/${opts.invoice.id}`,
        pdfUrl: `https://invoice.stripe.com/dry-run/${opts.invoice.id}/pdf`,
      };
    }

    // 1. Create invoice items
    for (const item of opts.invoice.lineItems) {
      const itemParams = new URLSearchParams({
        customer: opts.stripeCustomerId,
        amount: String(item.totalCents),
        currency: 'usd',
        description: item.description,
      });
      await this.post('/invoiceitems', itemParams.toString());
    }

    // 2. Create the invoice
    const invoiceParams = new URLSearchParams({
      customer: opts.stripeCustomerId,
      collection_method: 'send_invoice',
      days_until_due: '7',
      'metadata[operaxonInvoiceId]': opts.invoice.id,
      'metadata[tenantId]': opts.invoice.tenantId,
      'metadata[period]': opts.invoice.period,
    });

    const response = await this.post('/invoices', invoiceParams.toString());

    return {
      id: response.id,
      status: response.status,
      amountDue: response.amount_due,
      amountPaid: response.amount_paid,
      hostedInvoiceUrl: response.hosted_invoice_url,
      pdfUrl: response.invoice_pdf,
    };
  }

  // ─── Charge ───────────────────────────────────────────────────────────────────

  async finalizeAndSendInvoice(stripeInvoiceId: string): Promise<StripeInvoice> {
    if (this.config.dryRun) {
      console.log(`[Stripe DRY-RUN] finalizeAndSendInvoice: ${stripeInvoiceId}`);
      return { id: stripeInvoiceId, status: 'open', amountDue: 0, amountPaid: 0 };
    }

    const response = await this.post(`/invoices/${stripeInvoiceId}/finalize`, '');
    await this.post(`/invoices/${stripeInvoiceId}/send`, '');
    return { id: response.id, status: response.status, amountDue: response.amount_due, amountPaid: response.amount_paid };
  }

  async chargeCard(opts: {
    stripeCustomerId: string;
    amountCents: number;
    description: string;
    idempotencyKey: string;
  }): Promise<StripeCharge> {
    if (this.config.dryRun) {
      console.log(`[Stripe DRY-RUN] chargeCard: $${(opts.amountCents / 100).toFixed(2)} — ${opts.description}`);
      return {
        id: `ch_dry_${opts.idempotencyKey}`,
        status: 'succeeded',
        amountCents: opts.amountCents,
        currency: 'usd',
      };
    }

    const params = new URLSearchParams({
      customer: opts.stripeCustomerId,
      amount: String(opts.amountCents),
      currency: 'usd',
      description: opts.description,
    });

    const response = await this.post('/charges', params.toString(), opts.idempotencyKey);
    return {
      id: response.id,
      status: response.status,
      amountCents: response.amount,
      currency: response.currency,
    };
  }

  // ─── HTTP helpers ─────────────────────────────────────────────────────────────

  private async post(
    endpoint: string,
    body: string,
    idempotencyKey?: string
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string | number> = {
        'Authorization': `Bearer ${this.config.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'Stripe-Version': '2024-04-10',
      };
      if (idempotencyKey) {
        headers['Idempotency-Key'] = idempotencyKey;
      }

      const req = https.request(
        {
          hostname: 'api.stripe.com',
          path: `/v1${endpoint}`,
          method: 'POST',
          headers,
        },
        res => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (res.statusCode && res.statusCode >= 400) {
                reject(new Error(`Stripe error ${res.statusCode}: ${parsed.error?.message ?? data}`));
              } else {
                resolve(parsed);
              }
            } catch {
              reject(new Error(`Failed to parse Stripe response: ${data}`));
            }
          });
        }
      );

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}
