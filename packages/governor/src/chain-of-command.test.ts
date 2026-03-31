// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

import { describe, it, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { ChainOfCommand } from './chain-of-command.js';
import { PrincipalRegistry } from './principals.js';
import type { AgentConfig, Principal } from '@operaxon/types';

function makePrincipal(overrides: Partial<Principal> & { id: string }): Principal {
  return {
    name: overrides.name ?? 'Test User',
    contact: overrides.contact ?? 'telegram:12345',
    authority: overrides.authority ?? 'operator',
    ...overrides,
  };
}

function makeAgent(overrides: Partial<AgentConfig> & { id: string }): AgentConfig {
  return {
    name: overrides.name ?? 'test-agent',
    role: overrides.role ?? 'worker',
    model: overrides.model ?? 'claude-opus-4-20250514',
    domains: overrides.domains ?? [],
    tools: overrides.tools ?? [],
    memory: overrides.memory ?? 'isolated',
    containment: overrides.containment ?? {
      allowedTools: ['read', 'write'],
      deniedTools: ['rm_rf'],
      maxConcurrentActions: 3,
      requiresApproval: ['deploy:*'],
      clearanceLevel: 5,
    },
    ...overrides,
  };
}

describe('ChainOfCommand', () => {
  let principals: PrincipalRegistry;
  let chain: ChainOfCommand;

  beforeEach(() => {
    principals = new PrincipalRegistry();
    principals.register(makePrincipal({ id: 'sovereign-1', authority: 'sovereign', name: 'The Sovereign' }));
    principals.register(makePrincipal({ id: 'operator-1', authority: 'operator', name: 'The Operator' }));
    chain = new ChainOfCommand('gov-1', principals);
  });

  it('agent with correct clearance can perform action', () => {
    chain.registerAgent(makeAgent({ id: 'agent-1' }));
    const result = chain.validateAction({
      agentId: 'agent-1',
      action: 'read:memory',
      toolName: 'read',
      estimatedRiskLevel: 3,
    });
    assert.equal(result.allowed, true);
    assert.equal(result.requiresEscalation, false);
  });

  it('agent with insufficient clearance is denied and requires escalation', () => {
    chain.registerAgent(makeAgent({
      id: 'agent-1',
      containment: {
        allowedTools: ['read'],
        deniedTools: [],
        maxConcurrentActions: 3,
        requiresApproval: [],
        clearanceLevel: 2,
      },
    }));
    const result = chain.validateAction({
      agentId: 'agent-1',
      action: 'dangerous:operation',
      toolName: 'read',
      estimatedRiskLevel: 8,
    });
    assert.equal(result.allowed, false);
    assert.equal(result.requiresEscalation, true);
    assert.ok(result.reason.includes('exceeds clearance'));
  });

  it('escalation finds correct approver', () => {
    chain.registerAgent(makeAgent({ id: 'agent-1' }));

    // Escalate to operator level — governor can handle this
    const operatorEscalation = chain.escalate('agent-1', 'moderate:action', 'operator');
    assert.equal(operatorEscalation.escalated, true);
    assert.equal(operatorEscalation.escalatedTo, 'gov-1');

    // Escalate to sovereign level — must go to principal
    const sovereignEscalation = chain.escalate('agent-1', 'critical:action', 'sovereign');
    assert.equal(sovereignEscalation.escalated, true);
    assert.equal(sovereignEscalation.escalatedTo, 'sovereign-1');
  });

  it('denied tools are always blocked', () => {
    chain.registerAgent(makeAgent({ id: 'agent-1' }));
    const result = chain.validateAction({
      agentId: 'agent-1',
      action: 'destroy',
      toolName: 'rm_rf',
      estimatedRiskLevel: 1,
    });
    assert.equal(result.allowed, false);
    assert.equal(result.requiresEscalation, false);
    assert.ok(result.reason.includes('denied'));
  });

  it('approval-required patterns trigger approval flow', () => {
    chain.registerAgent(makeAgent({ id: 'agent-1' }));
    const result = chain.validateAction({
      agentId: 'agent-1',
      action: 'deploy:production',
      toolName: 'read',
      estimatedRiskLevel: 1,
    });
    assert.equal(result.allowed, false);
    assert.equal(result.requiresEscalation, true);
    assert.ok(result.reason.includes('requires principal approval'));
  });

  it('tool not in allowlist is blocked', () => {
    chain.registerAgent(makeAgent({ id: 'agent-1' }));
    const result = chain.validateAction({
      agentId: 'agent-1',
      action: 'some:action',
      toolName: 'exec_shell',
      estimatedRiskLevel: 1,
    });
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes('not in the allowlist'));
  });

  it('unknown agent is rejected', () => {
    const result = chain.validateAction({
      agentId: 'nonexistent',
      action: 'anything',
      toolName: null,
      estimatedRiskLevel: 0,
    });
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes('not found'));
  });

  it('chain hierarchy: agent reports to governor, governor reports to sovereign', () => {
    chain.registerAgent(makeAgent({ id: 'agent-1' }));
    const agentLink = chain.getLink('agent-1');
    assert.ok(agentLink);
    assert.equal(agentLink.reportsTo, 'gov-1');
    assert.equal(agentLink.entityType, 'agent');

    const govLink = chain.getLink('gov-1');
    assert.ok(govLink);
    assert.equal(govLink.reportsTo, 'sovereign-1');
    assert.equal(govLink.entityType, 'governor');
  });

  it('getChainToTop returns full hierarchy', () => {
    chain.registerAgent(makeAgent({ id: 'agent-1' }));
    const fullChain = chain.getChainToTop('agent-1');
    assert.equal(fullChain.length, 2); // agent -> governor (sovereign not in chain map)
    assert.equal(fullChain[0]!.entityId, 'agent-1');
    assert.equal(fullChain[1]!.entityId, 'gov-1');
  });

  it('escalation from governor goes to principal', () => {
    const result = chain.escalate('gov-1', 'critical:decision', 'sovereign');
    assert.equal(result.escalated, true);
    assert.equal(result.escalatedTo, 'sovereign-1');
  });

  it('null toolName bypasses tool checks', () => {
    chain.registerAgent(makeAgent({ id: 'agent-1' }));
    const result = chain.validateAction({
      agentId: 'agent-1',
      action: 'think',
      toolName: null,
      estimatedRiskLevel: 0,
    });
    assert.equal(result.allowed, true);
  });

  it('getApprover prefers most recently active principal', () => {
    // Touch operator to make it most recently active
    principals.touch('operator-1');

    const approver = chain.getApprover('operator');
    assert.ok(approver.found);
    assert.equal(approver.approverId, 'operator-1');
  });

  it('removeAgent removes from chain', () => {
    chain.registerAgent(makeAgent({ id: 'agent-1' }));
    assert.ok(chain.getLink('agent-1'));
    const removed = chain.removeAgent('agent-1');
    assert.equal(removed, true);
    assert.equal(chain.getLink('agent-1'), undefined);
  });
});
