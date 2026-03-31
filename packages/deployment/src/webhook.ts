// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * webhook.ts — Notify customers and internal systems when deployment completes
 */

import * as https from 'node:https';
import * as http from 'node:http';
import * as url from 'node:url';

// ─── Webhook event types ──────────────────────────────────────────────────────

export type WebhookEventType =
  | 'deployment.started'
  | 'deployment.complete'
  | 'deployment.failed'
  | 'deployment.rolled_back'
  | 'health.degraded'
  | 'health.recovered'
  | 'billing.invoice_generated'
  | 'billing.payment_failed';

export interface WebhookPayload {
  event: WebhookEventType;
  tenantId: string;
  customerId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface WebhookConfig {
  url: string;
  secret?: string;            // HMAC secret for signature verification
  headers?: Record<string, string>;
  retries?: number;           // default 3
  timeoutMs?: number;         // default 10s
}

export interface WebhookResult {
  success: boolean;
  statusCode?: number;
  attempts: number;
  error?: string;
}

// ─── WebhookDispatcher ────────────────────────────────────────────────────────

export class WebhookDispatcher {
  private configs: Map<string, WebhookConfig[]> = new Map(); // tenantId → configs

  // Register a webhook endpoint for a tenant
  register(tenantId: string, config: WebhookConfig): void {
    const existing = this.configs.get(tenantId) ?? [];
    this.configs.set(tenantId, [...existing, config]);
  }

  unregister(tenantId: string): void {
    this.configs.delete(tenantId);
  }

  // Fire a webhook for a specific tenant
  async fire(
    tenantId: string,
    customerId: string,
    event: WebhookEventType,
    data: Record<string, unknown>
  ): Promise<WebhookResult[]> {
    const configs = this.configs.get(tenantId) ?? [];
    if (configs.length === 0) {
      console.log(`[Webhook] No webhooks registered for tenant ${tenantId}`);
      return [];
    }

    const payload: WebhookPayload = {
      event,
      tenantId,
      customerId,
      timestamp: new Date().toISOString(),
      data,
    };

    return Promise.all(configs.map(cfg => this.send(cfg, payload)));
  }

  // Convenience: fire deployment complete notification
  async notifyDeploymentComplete(opts: {
    tenantId: string;
    customerId: string;
    instanceUrl: string;
    tier: string;
    apiKey: string;
  }): Promise<WebhookResult[]> {
    return this.fire(opts.tenantId, opts.customerId, 'deployment.complete', {
      instanceUrl: opts.instanceUrl,
      tier: opts.tier,
      apiKey: opts.apiKey,
      message: `Your Operaxon OS instance is live at ${opts.instanceUrl}`,
      nextSteps: [
        `1. Save your API key: ${opts.apiKey}`,
        `2. Access your dashboard: ${opts.instanceUrl}/dashboard`,
        `3. Configure your channels: ${opts.instanceUrl}/dashboard/settings`,
        `4. Your agents are ready. Say hello!`,
      ],
    });
  }

  // ─── HTTP send ────────────────────────────────────────────────────────────────

  private async send(
    config: WebhookConfig,
    payload: WebhookPayload,
    attempt = 1
  ): Promise<WebhookResult> {
    const maxAttempts = config.retries ?? 3;
    const timeoutMs = config.timeoutMs ?? 10000;
    const body = JSON.stringify(payload);

    const result = await this.httpPost(config.url, body, config.headers, timeoutMs);

    if (result.success) {
      return { ...result, attempts: attempt };
    }

    if (attempt < maxAttempts) {
      const backoffMs = Math.pow(2, attempt) * 1000; // exponential backoff
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      return this.send(config, payload, attempt + 1);
    }

    return { ...result, attempts: attempt };
  }

  private async httpPost(
    targetUrl: string,
    body: string,
    extraHeaders?: Record<string, string>,
    timeoutMs = 10000
  ): Promise<Omit<WebhookResult, 'attempts'>> {
    return new Promise(resolve => {
      const parsed = new url.URL(targetUrl);
      const isHttps = parsed.protocol === 'https:';
      const client = isHttps ? https : http;

      const options: http.RequestOptions = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'Operaxon-OS/1.0',
          ...extraHeaders,
        },
        timeout: timeoutMs,
      };

      const req = client.request(options, res => {
        res.resume(); // consume response
        const success = res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300;
        resolve({ success, statusCode: res.statusCode });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: `Request timed out after ${timeoutMs}ms` });
      });

      req.on('error', err => {
        resolve({ success: false, error: err.message });
      });

      req.write(body);
      req.end();
    });
  }
}
