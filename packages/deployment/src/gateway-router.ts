// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * gateway-router.ts — Route incoming messages to correct tenant gateway
 * Ensures: Tenant A messages never reach Tenant B's agents
 */

import { TenantManager } from './tenant-manager.js';

// ─── Route result ─────────────────────────────────────────────────────────────

export interface RouteResult {
  tenantId: string;
  instanceUrl: string;
  port: number;
  instanceName: string;
}

export interface RoutingError {
  code: 'TENANT_NOT_FOUND' | 'TENANT_NOT_RUNNING' | 'ROUTING_DISABLED' | 'INVALID_API_KEY';
  message: string;
}

// ─── GatewayRouter ────────────────────────────────────────────────────────────

export class GatewayRouter {
  private tenantManager: TenantManager;
  private apiKeyToTenantId: Map<string, string> = new Map();

  constructor(tenantManager: TenantManager) {
    this.tenantManager = tenantManager;
  }

  // Register an API key → tenantId mapping
  registerApiKey(apiKey: string, tenantId: string): void {
    this.apiKeyToTenantId.set(apiKey, tenantId);
  }

  revokeApiKey(apiKey: string): void {
    this.apiKeyToTenantId.delete(apiKey);
  }

  // ─── Routing strategies ───────────────────────────────────────────────────────

  // Route by API key (bearer token in Authorization header)
  routeByApiKey(apiKey: string): RouteResult | RoutingError {
    const tenantId = this.apiKeyToTenantId.get(apiKey);
    if (!tenantId) {
      return { code: 'INVALID_API_KEY', message: 'Invalid or unknown API key' };
    }
    return this.routeToTenant(tenantId);
  }

  // Route by tenant ID directly (for internal routing)
  routeByTenantId(tenantId: string): RouteResult | RoutingError {
    return this.routeToTenant(tenantId);
  }

  // Route by subdomain (e.g. "acmecorp.operaxon.com" → tenant lookup)
  routeBySubdomain(hostname: string): RouteResult | RoutingError {
    // Extract subdomain: "acmecorp.operaxon.com" → "acmecorp"
    const parts = hostname.split('.');
    if (parts.length < 3) {
      return { code: 'TENANT_NOT_FOUND', message: `Cannot extract tenant from hostname: ${hostname}` };
    }

    const subdomain = parts[0];
    const tenants = this.tenantManager.list({ status: 'running' });
    const tenant = tenants.find(t =>
      t.instanceName === subdomain ||
      t.instanceName === `operaxon-${subdomain}` ||
      t.id === subdomain
    );

    if (!tenant) {
      return { code: 'TENANT_NOT_FOUND', message: `No tenant found for subdomain: ${subdomain}` };
    }

    return this.routeToTenant(tenant.id);
  }

  // Route by X-Tenant-ID header (for internal API gateway)
  routeByHeader(tenantIdHeader: string): RouteResult | RoutingError {
    return this.routeToTenant(tenantIdHeader);
  }

  // ─── Core routing ─────────────────────────────────────────────────────────────

  private routeToTenant(tenantId: string): RouteResult | RoutingError {
    const tenant = this.tenantManager.get(tenantId);

    if (!tenant) {
      return { code: 'TENANT_NOT_FOUND', message: `Tenant not found: ${tenantId}` };
    }

    if (tenant.status !== 'running') {
      return {
        code: 'TENANT_NOT_RUNNING',
        message: `Tenant ${tenantId} is ${tenant.status}, not running`,
      };
    }

    const instanceUrl = tenant.instanceUrl ?? `http://localhost:${tenant.port}`;

    return {
      tenantId: tenant.id,
      instanceUrl,
      port: tenant.port,
      instanceName: tenant.instanceName,
    };
  }

  // ─── Proxy helper ─────────────────────────────────────────────────────────────

  // Returns the target URL for proxying a request to a tenant's gateway
  buildProxyTarget(route: RouteResult, requestPath: string): string {
    const base = route.instanceUrl.replace(/\/$/, '');
    const cleanPath = requestPath.startsWith('/') ? requestPath : `/${requestPath}`;
    return `${base}${cleanPath}`;
  }

  isRoutingError(result: RouteResult | RoutingError): result is RoutingError {
    return 'code' in result;
  }

  // ─── Registry ────────────────────────────────────────────────────────────────

  // Load all API keys from tenant store (call on startup or after new deployment)
  rebuildApiKeyRegistry(apiKeyLookup: Map<string, string>): void {
    this.apiKeyToTenantId.clear();
    for (const [apiKey, tenantId] of apiKeyLookup.entries()) {
      this.registerApiKey(apiKey, tenantId);
    }
  }

  listRegisteredTenants(): string[] {
    return Array.from(new Set(this.apiKeyToTenantId.values()));
  }
}
