// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

import { describe, it, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { PrincipalRegistry } from './principals.js';
import type { Principal } from '@operaxon/types';

function makePrincipal(overrides: Partial<Principal> & { id: string }): Principal {
  return {
    name: overrides.name ?? 'Test User',
    contact: overrides.contact ?? 'telegram:12345',
    authority: overrides.authority ?? 'operator',
    ...overrides,
  };
}

describe('PrincipalRegistry', () => {
  let registry: PrincipalRegistry;

  beforeEach(() => {
    registry = new PrincipalRegistry();
  });

  it('register and retrieve principal', () => {
    const principal = makePrincipal({ id: 'p1', authority: 'operator' });
    const record = registry.register(principal);
    assert.equal(record.principal.id, 'p1');
    assert.equal(record.principal.authority, 'operator');
    assert.ok(record.registeredAt);
    assert.equal(record.lastActiveAt, null);

    const retrieved = registry.get('p1');
    assert.ok(retrieved);
    assert.equal(retrieved.principal.id, 'p1');
  });

  it('sovereign can approve', () => {
    registry.register(makePrincipal({ id: 's1', authority: 'sovereign' }));
    assert.equal(registry.canApprove('s1'), true);
  });

  it('operator can approve', () => {
    registry.register(makePrincipal({ id: 'o1', authority: 'operator' }));
    assert.equal(registry.canApprove('o1'), true);
  });

  it('viewer cannot approve', () => {
    registry.register(makePrincipal({ id: 'v1', authority: 'viewer' }));
    assert.equal(registry.canApprove('v1'), false);
  });

  it('cannot remove last sovereign', () => {
    registry.register(makePrincipal({ id: 's1', authority: 'sovereign' }));
    assert.throws(
      () => registry.remove('s1', 's1'),
      (err: Error) => {
        assert.ok(err.message.includes('last sovereign'));
        return true;
      },
    );
  });

  it('can remove sovereign when another sovereign exists', () => {
    registry.register(makePrincipal({ id: 's1', authority: 'sovereign' }));
    registry.register(makePrincipal({ id: 's2', authority: 'sovereign', name: 'Sov 2' }));
    const removed = registry.remove('s2', 's1');
    assert.equal(removed, true);
    assert.equal(registry.get('s2'), undefined);
  });

  it('authority hierarchy is enforced', () => {
    registry.register(makePrincipal({ id: 's1', authority: 'sovereign' }));
    registry.register(makePrincipal({ id: 'o1', authority: 'operator' }));
    registry.register(makePrincipal({ id: 'v1', authority: 'viewer' }));

    // sovereign has all levels
    assert.equal(registry.hasAuthority('s1', 'sovereign'), true);
    assert.equal(registry.hasAuthority('s1', 'operator'), true);
    assert.equal(registry.hasAuthority('s1', 'viewer'), true);

    // operator has operator and viewer, not sovereign
    assert.equal(registry.hasAuthority('o1', 'sovereign'), false);
    assert.equal(registry.hasAuthority('o1', 'operator'), true);
    assert.equal(registry.hasAuthority('o1', 'viewer'), true);

    // viewer has only viewer
    assert.equal(registry.hasAuthority('v1', 'sovereign'), false);
    assert.equal(registry.hasAuthority('v1', 'operator'), false);
    assert.equal(registry.hasAuthority('v1', 'viewer'), true);
  });

  it('duplicate ID is rejected', () => {
    registry.register(makePrincipal({ id: 'p1' }));
    assert.throws(
      () => registry.register(makePrincipal({ id: 'p1' })),
      (err: Error) => {
        assert.ok(err.message.includes('already registered'));
        return true;
      },
    );
  });

  it('unknown principal returns false for authority checks', () => {
    assert.equal(registry.hasAuthority('ghost', 'viewer'), false);
    assert.equal(registry.canApprove('ghost'), false);
    assert.equal(registry.isSovereign('ghost'), false);
  });

  it('non-sovereign cannot remove principals', () => {
    registry.register(makePrincipal({ id: 's1', authority: 'sovereign' }));
    registry.register(makePrincipal({ id: 'o1', authority: 'operator' }));
    assert.throws(
      () => registry.remove('s1', 'o1'),
      (err: Error) => {
        assert.ok(err.message.includes('Only sovereigns'));
        return true;
      },
    );
  });

  it('listByAuthority filters correctly', () => {
    registry.register(makePrincipal({ id: 's1', authority: 'sovereign' }));
    registry.register(makePrincipal({ id: 'o1', authority: 'operator' }));
    registry.register(makePrincipal({ id: 'v1', authority: 'viewer' }));

    assert.equal(registry.listByAuthority('sovereign').length, 1);
    assert.equal(registry.listByAuthority('operator').length, 2); // sovereign + operator
    assert.equal(registry.listByAuthority('viewer').length, 3); // all
  });

  it('validateAuthority throws on insufficient authority', () => {
    registry.register(makePrincipal({ id: 'v1', authority: 'viewer' }));
    assert.throws(
      () => registry.validateAuthority({ principalId: 'v1', requiredLevel: 'operator' }),
      (err: Error) => {
        assert.ok(err.message.includes('Insufficient authority'));
        return true;
      },
    );
  });

  it('validateAuthority passes for sufficient authority', () => {
    registry.register(makePrincipal({ id: 's1', authority: 'sovereign' }));
    assert.doesNotThrow(() =>
      registry.validateAuthority({ principalId: 's1', requiredLevel: 'operator' }),
    );
  });
});
