// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

import { describe, it, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { AgentContainment } from './containment.js';
import type { AgentConfig } from '@operaxon/types';

function makeAgent(overrides: Partial<AgentConfig> & { id: string }): AgentConfig {
  return {
    name: overrides.name ?? 'test-agent',
    role: overrides.role ?? 'worker',
    model: overrides.model ?? 'claude-opus-4-20250514',
    domains: overrides.domains ?? [],
    tools: overrides.tools ?? [],
    memory: overrides.memory ?? 'isolated',
    containment: overrides.containment ?? {
      allowedTools: [],
      deniedTools: [],
      maxConcurrentActions: 3,
      requiresApproval: [],
      clearanceLevel: 5,
    },
    ...overrides,
  };
}

describe('AgentContainment', () => {
  let containment: AgentContainment;

  beforeEach(() => {
    containment = new AgentContainment();
  });

  it('registered agent can use allowed tools', () => {
    containment.registerAgent(makeAgent({
      id: 'a1',
      containment: {
        allowedTools: ['read', 'write'],
        deniedTools: [],
        maxConcurrentActions: 3,
        requiresApproval: [],
        clearanceLevel: 5,
      },
    }));
    const result = containment.canUseTool('a1', 'read');
    assert.equal(result.allowed, true);
  });

  it('registered agent cannot use denied tools', () => {
    containment.registerAgent(makeAgent({
      id: 'a1',
      containment: {
        allowedTools: [],
        deniedTools: ['rm_rf'],
        maxConcurrentActions: 3,
        requiresApproval: [],
        clearanceLevel: 5,
      },
    }));
    const result = containment.canUseTool('a1', 'rm_rf');
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes('denied'));
  });

  it('denied tools take priority over allowed tools', () => {
    containment.registerAgent(makeAgent({
      id: 'a1',
      containment: {
        allowedTools: ['dangerous_tool'],
        deniedTools: ['dangerous_tool'],
        maxConcurrentActions: 3,
        requiresApproval: [],
        clearanceLevel: 5,
      },
    }));
    const result = containment.canUseTool('a1', 'dangerous_tool');
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes('denied'));
  });

  it('unknown agent is denied all tools', () => {
    const result = containment.canUseTool('nonexistent', 'read');
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes('No containment policy'));
  });

  it('empty allowlist allows all tools (except denied)', () => {
    containment.registerAgent(makeAgent({
      id: 'a1',
      containment: {
        allowedTools: [],
        deniedTools: ['blocked'],
        maxConcurrentActions: 3,
        requiresApproval: [],
        clearanceLevel: 5,
      },
    }));
    assert.equal(containment.canUseTool('a1', 'anything').allowed, true);
    assert.equal(containment.canUseTool('a1', 'read').allowed, true);
    assert.equal(containment.canUseTool('a1', 'blocked').allowed, false);
  });

  it('tool not in non-empty allowlist is denied', () => {
    containment.registerAgent(makeAgent({
      id: 'a1',
      containment: {
        allowedTools: ['read'],
        deniedTools: [],
        maxConcurrentActions: 3,
        requiresApproval: [],
        clearanceLevel: 5,
      },
    }));
    const result = containment.canUseTool('a1', 'write');
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes('not in the allowlist'));
  });

  it('concurrent action limit is enforced', () => {
    containment.registerAgent(makeAgent({
      id: 'a1',
      containment: {
        allowedTools: [],
        deniedTools: [],
        maxConcurrentActions: 2,
        requiresApproval: [],
        clearanceLevel: 5,
      },
    }));
    assert.equal(containment.canStartAction('a1').allowed, true);
    assert.equal(containment.canStartAction('a1').allowed, true);
    const third = containment.canStartAction('a1');
    assert.equal(third.allowed, false);
    assert.ok(third.reason.includes('max concurrent'));
  });

  it('completing action frees up slot', () => {
    containment.registerAgent(makeAgent({
      id: 'a1',
      containment: {
        allowedTools: [],
        deniedTools: [],
        maxConcurrentActions: 1,
        requiresApproval: [],
        clearanceLevel: 5,
      },
    }));
    assert.equal(containment.canStartAction('a1').allowed, true);
    assert.equal(containment.canStartAction('a1').allowed, false);

    containment.completeAction('a1');
    assert.equal(containment.canStartAction('a1').allowed, true);
  });

  it('clearance level check works correctly', () => {
    containment.registerAgent(makeAgent({
      id: 'a1',
      containment: {
        allowedTools: [],
        deniedTools: [],
        maxConcurrentActions: 3,
        requiresApproval: [],
        clearanceLevel: 5,
      },
    }));
    assert.equal(containment.checkClearance('a1', 3).allowed, true);
    assert.equal(containment.checkClearance('a1', 5).allowed, true);
    assert.equal(containment.checkClearance('a1', 6).allowed, false);
    assert.equal(containment.checkClearance('a1', 10).allowed, false);
  });

  it('clearance check on unknown agent is denied', () => {
    const result = containment.checkClearance('ghost', 1);
    assert.equal(result.allowed, false);
  });

  it('approval required for matching patterns', () => {
    containment.registerAgent(makeAgent({
      id: 'a1',
      containment: {
        allowedTools: [],
        deniedTools: [],
        maxConcurrentActions: 3,
        requiresApproval: ['deploy:production'],
        clearanceLevel: 5,
      },
    }));
    assert.equal(containment.requiresApproval('a1', 'deploy:production'), true);
  });

  it('glob patterns work (deploy:*, delete:*)', () => {
    containment.registerAgent(makeAgent({
      id: 'a1',
      containment: {
        allowedTools: [],
        deniedTools: [],
        maxConcurrentActions: 3,
        requiresApproval: ['deploy:*', 'delete:*'],
        clearanceLevel: 5,
      },
    }));
    assert.equal(containment.requiresApproval('a1', 'deploy:staging'), true);
    assert.equal(containment.requiresApproval('a1', 'deploy:production'), true);
    assert.equal(containment.requiresApproval('a1', 'delete:database'), true);
    assert.equal(containment.requiresApproval('a1', 'read:config'), false);
  });

  it('non-matching patterns do not require approval', () => {
    containment.registerAgent(makeAgent({
      id: 'a1',
      containment: {
        allowedTools: [],
        deniedTools: [],
        maxConcurrentActions: 3,
        requiresApproval: ['deploy:*'],
        clearanceLevel: 5,
      },
    }));
    assert.equal(containment.requiresApproval('a1', 'read:memory'), false);
    assert.equal(containment.requiresApproval('a1', 'write:log'), false);
  });

  it('unknown agent always requires approval', () => {
    assert.equal(containment.requiresApproval('unknown', 'any_action'), true);
  });

  it('canStartAction on unknown agent is denied', () => {
    const result = containment.canStartAction('ghost');
    assert.equal(result.allowed, false);
  });

  it('completeAction does not go below zero', () => {
    containment.registerAgent(makeAgent({
      id: 'a1',
      containment: {
        allowedTools: [],
        deniedTools: [],
        maxConcurrentActions: 1,
        requiresApproval: [],
        clearanceLevel: 5,
      },
    }));
    // Complete without starting — should not cause negative count
    containment.completeAction('a1');
    containment.completeAction('a1');
    // Should still be able to start one action
    assert.equal(containment.canStartAction('a1').allowed, true);
  });
});
