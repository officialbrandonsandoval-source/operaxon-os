// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * auth.ts — Customer dashboard authentication
 * API key (bearer token) + optional session management
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Auth credential ──────────────────────────────────────────────────────────

export interface DashboardCredential {
  tenantId: string;
  customerId: string;
  apiKeyHash: string;           // SHA-256 of the real API key
  email: string;
  role: 'owner' | 'viewer';
  createdAt: string;
  lastSeenAt?: string;
}

// ─── Auth result ──────────────────────────────────────────────────────────────

export interface AuthResult {
  authenticated: boolean;
  tenantId?: string;
  customerId?: string;
  email?: string;
  role?: string;
  error?: string;
}

// ─── DashboardAuth ────────────────────────────────────────────────────────────

export class DashboardAuth {
  private credStorePath: string;
  private credentials: Map<string, DashboardCredential> = new Map(); // apiKeyHash → cred

  constructor(credStorePath: string) {
    this.credStorePath = credStorePath;
    this.load();
  }

  private load(): void {
    if (fs.existsSync(this.credStorePath)) {
      const records: DashboardCredential[] = JSON.parse(
        fs.readFileSync(this.credStorePath, 'utf-8')
      );
      for (const cred of records) {
        this.credentials.set(cred.apiKeyHash, cred);
      }
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.credStorePath), { recursive: true });
    fs.writeFileSync(
      this.credStorePath,
      JSON.stringify(Array.from(this.credentials.values()), null, 2),
      'utf-8'
    );
  }

  // Register a new API key for a tenant
  register(opts: {
    tenantId: string;
    customerId: string;
    apiKey: string;
    email: string;
    role?: 'owner' | 'viewer';
  }): void {
    const hash = createHash('sha256').update(opts.apiKey).digest('hex');
    const cred: DashboardCredential = {
      tenantId: opts.tenantId,
      customerId: opts.customerId,
      apiKeyHash: hash,
      email: opts.email,
      role: opts.role ?? 'owner',
      createdAt: new Date().toISOString(),
    };
    this.credentials.set(hash, cred);
    this.save();
  }

  revoke(tenantId: string): void {
    for (const [hash, cred] of this.credentials.entries()) {
      if (cred.tenantId === tenantId) {
        this.credentials.delete(hash);
      }
    }
    this.save();
  }

  // ─── Verify ───────────────────────────────────────────────────────────────────

  verify(apiKey: string): AuthResult {
    if (!apiKey || !apiKey.startsWith('ox_live_')) {
      return { authenticated: false, error: 'Invalid API key format' };
    }

    const hash = createHash('sha256').update(apiKey).digest('hex');

    // Timing-safe lookup
    let found: DashboardCredential | undefined;
    for (const [storedHash, cred] of this.credentials.entries()) {
      const a = Buffer.from(hash, 'hex');
      const b = Buffer.from(storedHash, 'hex');
      if (a.length === b.length && timingSafeEqual(a, b)) {
        found = cred;
        break;
      }
    }

    if (!found) {
      return { authenticated: false, error: 'API key not found or revoked' };
    }

    // Update last seen
    found.lastSeenAt = new Date().toISOString();
    this.credentials.set(hash, found);
    // Don't save on every request — use periodic flush or next write

    return {
      authenticated: true,
      tenantId: found.tenantId,
      customerId: found.customerId,
      email: found.email,
      role: found.role,
    };
  }

  // Extract API key from Authorization header
  extractFromHeader(authHeader?: string): string | null {
    if (!authHeader) return null;
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
  }

  // Middleware-style verify (accepts Authorization header value)
  verifyHeader(authHeader?: string): AuthResult {
    const apiKey = this.extractFromHeader(authHeader);
    if (!apiKey) {
      return { authenticated: false, error: 'Missing Authorization header (Bearer token required)' };
    }
    return this.verify(apiKey);
  }
}
