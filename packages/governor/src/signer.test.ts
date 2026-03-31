// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

import { describe, it, before } from 'node:test';
import { strict as assert } from 'node:assert';
import { AgentSigner } from './signer.js';
import type { AgentDecision } from './signer.js';

describe('AgentSigner', () => {
  let signer: AgentSigner;
  const signingKey = Buffer.from('test-signing-key-32-bytes-long!!');

  before(() => {
    signer = new AgentSigner(signingKey);
  });

  it('throws if signing key too short', () => {
    assert.throws(
      () => new AgentSigner(Buffer.from('short')),
      (err: Error) => { assert.ok(err.message.includes('16 bytes')); return true; },
    );
  });

  it('signs a decision and verifies it', () => {
    const decision: AgentDecision = {
      agentId: 'agt-001',
      action: 'deploy:staging',
      outcome: 'executed',
      timestamp: new Date().toISOString(),
    };

    const signed = signer.sign(decision);
    assert.ok(signed.signature);
    assert.ok(signed.issuedAt);
    assert.equal(signed.expiresAt, null); // no TTL

    const result = signer.verify(signed);
    assert.equal(result.valid, true);
    assert.equal(result.expired, false);
    assert.ok(result.decision);
    assert.equal(result.decision.agentId, 'agt-001');
    assert.equal(result.decision.action, 'deploy:staging');
  });

  it('detects tampered payload', () => {
    const decision: AgentDecision = {
      agentId: 'agt-001',
      action: 'code:write',
      outcome: 'approved',
      timestamp: new Date().toISOString(),
    };

    const signed = signer.sign(decision);

    // Tamper with the payload
    const tampered = {
      ...signed,
      payload: { ...signed.payload, action: 'delete:database' }, // changed!
    };

    const result = signer.verify(tampered);
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('tampered'));
  });

  it('detects expired decisions', () => {
    const decision: AgentDecision = {
      agentId: 'agt-001',
      action: 'code:read',
      outcome: 'approved',
      timestamp: new Date().toISOString(),
    };

    // Sign with TTL of 1 second
    const signed = signer.sign(decision, 1);

    // Manually backdate expiresAt to simulate expiry
    const expired = {
      ...signed,
      expiresAt: new Date(Date.now() - 5000).toISOString(), // expired 5 sec ago
    };

    const result = signer.verify(expired);
    assert.equal(result.valid, false);
    assert.equal(result.expired, true);
  });

  it('issues and verifies identity tokens', () => {
    const token = signer.issueToken('agt-002', 300);
    assert.equal(token.agentId, 'agt-002');
    assert.ok(token.nonce);
    assert.ok(token.signature);

    const result = signer.verifyToken(token);
    assert.equal(result.valid, true);
    assert.equal(result.expired, false);
  });

  it('detects tampered identity tokens', () => {
    const token = signer.issueToken('agt-003');

    // Tamper with agentId
    const tampered = { ...token, agentId: 'agt-000' };
    const result = signer.verifyToken(tampered);
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('invalid'));
  });

  it('signs decisions with metadata', () => {
    const decision: AgentDecision = {
      agentId: 'agt-001',
      action: 'git:push',
      outcome: 'executed',
      timestamp: new Date().toISOString(),
      metadata: { repo: 'operaxon-os', branch: 'main', commit: 'abc123' },
    };

    const signed = signer.sign(decision, 3600);
    assert.notEqual(signed.expiresAt, null);

    const result = signer.verify(signed);
    assert.equal(result.valid, true);
    assert.equal((result.decision?.metadata as Record<string, string>)?.['repo'], 'operaxon-os');
  });

  it('different keys produce different signatures', () => {
    const signer2 = new AgentSigner(Buffer.from('different-signing-key-32-bytes!!'));
    const decision: AgentDecision = {
      agentId: 'agt-001',
      action: 'code:write',
      outcome: 'approved',
      timestamp: new Date().toISOString(),
    };

    const signed1 = signer.sign(decision);
    const signed2 = signer2.sign(decision);

    assert.notEqual(signed1.signature, signed2.signature);

    // Cross-verify should fail
    const crossResult = signer2.verify(signed1);
    assert.equal(crossResult.valid, false);
  });
});
