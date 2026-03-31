// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

import { URL } from 'node:url';
import type { SSRFPolicy } from '@operaxon/types';
import { isIP } from 'node:net';

const PRIVATE_CIDRS = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '0.0.0.0/8',
  '::1/128',
  'fc00::/7',
  'fe80::/10',
];

export class SSRFProtection {
  private readonly policy: SSRFPolicy;

  constructor(policy?: Partial<SSRFPolicy>) {
    this.policy = {
      allowedHosts: policy?.allowedHosts ?? [],
      deniedCIDRs: [...PRIVATE_CIDRS, ...(policy?.deniedCIDRs ?? [])],
      maxRedirects: policy?.maxRedirects ?? 3,
    };
  }

  validateUrl(urlString: string): SSRFValidation {
    let parsed: URL;
    try {
      parsed = new URL(urlString);
    } catch {
      return { safe: false, reason: 'Invalid URL' };
    }

    // Block non-HTTP(S) protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { safe: false, reason: `Protocol "${parsed.protocol}" is not allowed` };
    }

    // Block if hostname resolves to private IP
    if (isIP(parsed.hostname)) {
      if (this.isPrivateIP(parsed.hostname)) {
        return { safe: false, reason: 'URL resolves to private/reserved IP address' };
      }
    }

    // Block common SSRF bypass attempts
    if (parsed.hostname.includes('@') || parsed.hostname.includes('\\')) {
      return { safe: false, reason: 'Suspicious hostname characters detected' };
    }

    // If allowedHosts is non-empty, enforce whitelist
    if (this.policy.allowedHosts.length > 0 && !this.policy.allowedHosts.includes(parsed.hostname)) {
      return { safe: false, reason: `Host "${parsed.hostname}" is not in the allowed hosts list` };
    }

    return { safe: true, reason: 'URL passed SSRF validation' };
  }

  private isPrivateIP(ip: string): boolean {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return false; // Let IPv6 through for now, block via CIDR

    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] !== undefined && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 127.0.0.0/8
    if (parts[0] === 127) return true;
    // 169.254.0.0/16
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0/8
    if (parts[0] === 0) return true;

    return false;
  }
}

export interface SSRFValidation {
  safe: boolean;
  reason: string;
}
