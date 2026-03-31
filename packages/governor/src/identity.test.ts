// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

import { describe, it, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  AgentIdentity,
  IdentityRegistry,
  CIVILIZATION_AGENTS,
} from './identity.js';

describe('AgentIdentity', () => {
  it('creates identity with all fields', () => {
    const identity = new AgentIdentity({
      id: 'agt-001',
      name: 'Praxis',
      role: 'builder',
      capabilities: ['code', 'deploy', 'git'],
      limits: { maxConcurrentTasks: 3, maxActionsPerMinute: 60 },
    });

    assert.equal(identity.id, 'agt-001');
    assert.equal(identity.name, 'Praxis');
    assert.equal(identity.role, 'builder');
    assert.equal(identity.status, 'active');
    assert.ok(identity.createdAt);
  });

  it('governor has wildcard capabilities', () => {
    const governor = new AgentIdentity({
      id: 'agt-000',
      name: 'Dominus Sui',
      role: 'governor',
      capabilities: ['*'],
      limits: { maxConcurrentTasks: 10, maxActionsPerMinute: 1000 },
    });

    assert.equal(governor.isGovernor, true);
    assert.equal(governor.hasCapability('anything'), true);
    assert.equal(governor.hasCapability('deploy:production'), true);
    assert.equal(governor.hasCapability('delete:database'), true);
  });

  it('builder has only its capabilities', () => {
    const praxis = new AgentIdentity({
      id: 'agt-001',
      name: 'Praxis',
      role: 'builder',
      capabilities: ['code', 'deploy', 'git'],
      limits: { maxConcurrentTasks: 3, maxActionsPerMinute: 60 },
    });

    assert.equal(praxis.hasCapability('code'), true);
    assert.equal(praxis.hasCapability('deploy'), true);
    assert.equal(praxis.hasCapability('trade'), false);
    assert.equal(praxis.hasCapability('legal'), false);
    assert.equal(praxis.isGovernor, false);
  });

  it('prefix wildcard capabilities work', () => {
    const identity = new AgentIdentity({
      id: 'agt-test',
      name: 'Test',
      role: 'worker',
      capabilities: ['file:*'],
      limits: { maxConcurrentTasks: 1, maxActionsPerMinute: 10 },
    });

    assert.equal(identity.hasCapability('file:read'), true);
    assert.equal(identity.hasCapability('file:write'), true);
    assert.equal(identity.hasCapability('file:delete'), true);
    assert.equal(identity.hasCapability('deploy:production'), false);
  });

  it('requiresApproval checks patterns', () => {
    const praxis = new AgentIdentity({
      id: 'agt-001',
      name: 'Praxis',
      role: 'builder',
      capabilities: ['code', 'deploy', 'git'],
      limits: {
        maxConcurrentTasks: 3,
        maxActionsPerMinute: 60,
        requiresApprovalFor: ['deploy:production', 'delete:*'],
      },
    });

    assert.equal(praxis.requiresApproval('deploy:production'), true);
    assert.equal(praxis.requiresApproval('delete:file.ts'), true);
    assert.equal(praxis.requiresApproval('git:commit'), false);
    assert.equal(praxis.requiresApproval('code:write'), false);
  });

  it('can suspend and activate identity', () => {
    const identity = new AgentIdentity({
      id: 'agt-test',
      name: 'Test',
      role: 'worker',
      capabilities: [],
      limits: { maxConcurrentTasks: 1, maxActionsPerMinute: 10 },
    });

    assert.equal(identity.status, 'active');
    identity.suspend();
    assert.equal(identity.status, 'suspended');
    identity.activate();
    assert.equal(identity.status, 'active');
    identity.revoke();
    assert.equal(identity.status, 'revoked');
  });

  it('throws if required fields missing', () => {
    assert.throws(
      () => new AgentIdentity({ id: '', name: 'Test', role: 'worker', capabilities: [], limits: { maxConcurrentTasks: 1, maxActionsPerMinute: 10 } }),
      (err: Error) => { assert.ok(err.message.includes('id')); return true; },
    );
  });
});

describe('IdentityRegistry', () => {
  let registry: IdentityRegistry;

  beforeEach(() => {
    registry = new IdentityRegistry();
  });

  it('register and retrieve identity', () => {
    const identity = registry.register({
      id: 'agt-001',
      name: 'Praxis',
      role: 'builder',
      capabilities: ['code'],
      limits: { maxConcurrentTasks: 3, maxActionsPerMinute: 60 },
    });

    assert.equal(identity.id, 'agt-001');
    const retrieved = registry.get('agt-001');
    assert.ok(retrieved);
    assert.equal(retrieved.name, 'Praxis');
  });

  it('prevents duplicate registration', () => {
    registry.register({ id: 'agt-001', name: 'A', role: 'worker', capabilities: [], limits: { maxConcurrentTasks: 1, maxActionsPerMinute: 10 } });
    assert.throws(
      () => registry.register({ id: 'agt-001', name: 'B', role: 'worker', capabilities: [], limits: { maxConcurrentTasks: 1, maxActionsPerMinute: 10 } }),
      (err: Error) => { assert.ok(err.message.includes('already registered')); return true; },
    );
  });

  it('loadCivilization loads all 7 agents', () => {
    registry.loadCivilization();
    const agents = registry.list();
    assert.equal(agents.length, Object.keys(CIVILIZATION_AGENTS).length);

    // Verify specific agents
    const dominus = registry.get('agt-000');
    assert.ok(dominus);
    assert.equal(dominus.name, 'Dominus Sui');
    assert.equal(dominus.role, 'governor');

    const praxis = registry.get('agt-001');
    assert.ok(praxis);
    assert.equal(praxis.name, 'Praxis');
  });

  it('byRole filters correctly', () => {
    registry.loadCivilization();
    const governors = registry.byRole('governor');
    assert.equal(governors.length, 1);
    assert.equal(governors[0]?.name, 'Dominus Sui');

    const builders = registry.byRole('builder');
    assert.equal(builders.length, 1);
    assert.equal(builders[0]?.name, 'Praxis');
  });

  it('isActive returns false for unknown agents', () => {
    assert.equal(registry.isActive('unknown-agent'), false);
  });
});
