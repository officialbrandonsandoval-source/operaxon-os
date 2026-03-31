// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * Signer — sign and verify agent decisions for tamper-proof accountability.
 *
 * Uses HMAC-SHA256 (JWT-like) to sign agent decisions.
 * No external auth service needed — key is stored in the OS keychain.
 *
 * Usage:
 *   const signer = new AgentSigner(signingKey);
 *   const token = signer.sign({ agentId, action, timestamp, outcome });
 *   const valid = signer.verify(token);
 */

import { createHmac } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentDecision {
  agentId: string;
  action: string;
  outcome: 'approved' | 'denied' | 'pending' | 'executed';
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface SignedDecision {
  payload: AgentDecision;
  signature: string;
  issuedAt: string;
  expiresAt: string | null;
}

export interface VerificationResult {
  valid: boolean;
  expired: boolean;
  decision: AgentDecision | null;
  reason: string;
}

export interface AgentToken {
  agentId: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  signature: string;
}

// ---------------------------------------------------------------------------
// AgentSigner
// ---------------------------------------------------------------------------

export class AgentSigner {
  private readonly signingKey: Buffer;
  private readonly algorithm = 'sha256';

  constructor(signingKey: Buffer) {
    if (signingKey.length < 16) {
      throw new Error('Signing key must be at least 16 bytes');
    }
    this.signingKey = signingKey;
  }

  // -----------------------------------------------------------------------
  // Decision signing
  // -----------------------------------------------------------------------

  /**
   * Sign an agent decision. Returns a SignedDecision that includes
   * the original payload plus an HMAC signature.
   *
   * @param decision - The decision to sign
   * @param ttlSeconds - Optional TTL in seconds (default: no expiry)
   */
  sign(decision: AgentDecision, ttlSeconds?: number): SignedDecision {
    const issuedAt = new Date().toISOString();
    const expiresAt = ttlSeconds !== undefined
      ? new Date(Date.now() + ttlSeconds * 1000).toISOString()
      : null;

    const payload = { ...decision };
    const dataToSign = JSON.stringify({ payload, issuedAt, expiresAt });
    const signature = this.hmac(dataToSign);

    return { payload, signature, issuedAt, expiresAt };
  }

  /**
   * Verify a signed decision.
   * Returns valid=true if the signature matches and the token is not expired.
   */
  verify(signed: SignedDecision): VerificationResult {
    const { payload, issuedAt, expiresAt } = signed;

    // Check expiry
    if (expiresAt !== null && new Date(expiresAt).getTime() < Date.now()) {
      return {
        valid: false,
        expired: true,
        decision: null,
        reason: `Token expired at ${expiresAt}`,
      };
    }

    // Reconstruct and verify signature
    const dataToSign = JSON.stringify({ payload, issuedAt, expiresAt });
    const expectedSig = this.hmac(dataToSign);

    if (!timingSafeEqual(signed.signature, expectedSig)) {
      return {
        valid: false,
        expired: false,
        decision: null,
        reason: 'Signature mismatch — token may have been tampered with',
      };
    }

    return {
      valid: true,
      expired: false,
      decision: payload,
      reason: 'Signature valid',
    };
  }

  // -----------------------------------------------------------------------
  // Identity tokens (for agent-to-agent communication)
  // -----------------------------------------------------------------------

  /**
   * Issue a short-lived identity token for an agent.
   * Used to verify the sender in agent-to-agent messages.
   *
   * @param agentId - The agent issuing the token
   * @param ttlSeconds - Token lifetime (default: 5 minutes)
   */
  issueToken(agentId: string, ttlSeconds: number = 300): AgentToken {
    const issuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const nonce = generateNonce();

    const dataToSign = JSON.stringify({ agentId, issuedAt, expiresAt, nonce });
    const signature = this.hmac(dataToSign);

    return { agentId, issuedAt, expiresAt, nonce, signature };
  }

  /**
   * Verify an agent identity token.
   */
  verifyToken(token: AgentToken): VerificationResult {
    // Check expiry
    if (new Date(token.expiresAt).getTime() < Date.now()) {
      return {
        valid: false,
        expired: true,
        decision: null,
        reason: `Token for ${token.agentId} expired at ${token.expiresAt}`,
      };
    }

    const { agentId, issuedAt, expiresAt, nonce } = token;
    const dataToSign = JSON.stringify({ agentId, issuedAt, expiresAt, nonce });
    const expectedSig = this.hmac(dataToSign);

    if (!timingSafeEqual(token.signature, expectedSig)) {
      return {
        valid: false,
        expired: false,
        decision: null,
        reason: `Token signature invalid for agent ${agentId}`,
      };
    }

    return {
      valid: true,
      expired: false,
      decision: {
        agentId,
        action: 'identity:verify',
        outcome: 'approved',
        timestamp: issuedAt,
      },
      reason: 'Identity token valid',
    };
  }

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------

  /**
   * Compute HMAC-SHA256 of the data.
   */
  private hmac(data: string): string {
    return createHmac(this.algorithm, this.signingKey)
      .update(data, 'utf8')
      .digest('hex');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a random nonce string.
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Constant-time string comparison to prevent timing attacks.
 * Uses XOR comparison on char codes.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  }
  return diff === 0;
}
