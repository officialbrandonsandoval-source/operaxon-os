// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

import type { Principal, AuthorityLevel } from '@operaxon/types';

/**
 * Internal record wrapping a Principal with registration metadata.
 */
export interface PrincipalRecord {
  principal: Principal;
  registeredAt: string;
  lastActiveAt: string | null;
}

/**
 * Query specifying the minimum authority required for an operation.
 */
export interface AuthorityQuery {
  principalId: string;
  requiredLevel: AuthorityLevel;
}

/** Ordered authority levels from highest to lowest privilege. */
const AUTHORITY_RANK: ReadonlyMap<AuthorityLevel, number> = new Map([
  ['sovereign', 3],
  ['operator', 2],
  ['viewer', 1],
]);

function authorityRank(level: AuthorityLevel): number {
  const rank = AUTHORITY_RANK.get(level);
  if (rank === undefined) {
    throw new Error(`Unknown authority level: ${String(level)}`);
  }
  return rank;
}

/**
 * PrincipalRegistry — manages the principal hierarchy for an Operaxon civilization.
 *
 * Principals are the humans (or external systems) that a Governor reports to.
 * Authority levels enforce what each principal is allowed to do:
 *   - sovereign: full control, can approve anything, modify agents, change config
 *   - operator:  can manage agents, approve standard actions, run tasks
 *   - viewer:    read-only observation of civilization state
 */
export class PrincipalRegistry {
  private readonly records: Map<string, PrincipalRecord> = new Map();

  /**
   * Register a principal. Throws if a principal with the same id is already registered.
   */
  register(principal: Principal): PrincipalRecord {
    if (this.records.has(principal.id)) {
      throw new Error(`Principal already registered: ${principal.id}`);
    }

    PrincipalRegistry.validatePrincipal(principal);

    const record: PrincipalRecord = {
      principal,
      registeredAt: new Date().toISOString(),
      lastActiveAt: null,
    };

    this.records.set(principal.id, record);
    return record;
  }

  /**
   * Remove a principal by id. Only a sovereign can remove other principals.
   * Returns true if the principal was removed, false if not found.
   */
  remove(principalId: string, removedBy: string): boolean {
    if (!this.records.has(principalId)) {
      return false;
    }

    const remover = this.records.get(removedBy);
    if (!remover) {
      throw new Error(`Removing principal not found: ${removedBy}`);
    }
    if (!this.isSovereign(removedBy)) {
      throw new Error(
        `Only sovereigns can remove principals. ${removedBy} has authority: ${remover.principal.authority}`,
      );
    }

    // Prevent removing the last sovereign — civilization must always have one.
    const target = this.records.get(principalId);
    if (target && this.isSovereign(principalId)) {
      const sovereignCount = this.listByAuthority('sovereign').length;
      if (sovereignCount <= 1) {
        throw new Error('Cannot remove the last sovereign principal');
      }
    }

    this.records.delete(principalId);
    return true;
  }

  /**
   * Retrieve a principal record by id. Returns undefined if not found.
   */
  get(principalId: string): PrincipalRecord | undefined {
    return this.records.get(principalId);
  }

  /**
   * List all registered principal records.
   */
  list(): readonly PrincipalRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * List principals that have at least the given authority level.
   */
  listByAuthority(minLevel: AuthorityLevel): readonly PrincipalRecord[] {
    const minRank = authorityRank(minLevel);
    return Array.from(this.records.values()).filter(
      (r) => authorityRank(r.principal.authority) >= minRank,
    );
  }

  /**
   * Check whether the given principal has authority >= the required level.
   */
  hasAuthority(principalId: string, requiredLevel: AuthorityLevel): boolean {
    const record = this.records.get(principalId);
    if (!record) {
      return false;
    }
    return authorityRank(record.principal.authority) >= authorityRank(requiredLevel);
  }

  /**
   * True if the principal exists and is a sovereign.
   */
  isSovereign(principalId: string): boolean {
    return this.hasAuthority(principalId, 'sovereign');
  }

  /**
   * True if the principal can approve actions (operator or above).
   */
  canApprove(principalId: string): boolean {
    return this.hasAuthority(principalId, 'operator');
  }

  /**
   * True if the principal can view civilization state (viewer or above — i.e. any valid principal).
   */
  canView(principalId: string): boolean {
    return this.hasAuthority(principalId, 'viewer');
  }

  /**
   * Mark a principal as active (e.g. after a session interaction).
   */
  touch(principalId: string): void {
    const record = this.records.get(principalId);
    if (record) {
      record.lastActiveAt = new Date().toISOString();
    }
  }

  /**
   * Validate that a principal satisfies the given authority query.
   * Throws with a descriptive message on failure.
   */
  validateAuthority(query: AuthorityQuery): void {
    const record = this.records.get(query.principalId);
    if (!record) {
      throw new Error(`Principal not found: ${query.principalId}`);
    }
    if (!this.hasAuthority(query.principalId, query.requiredLevel)) {
      throw new Error(
        `Insufficient authority: ${query.principalId} has "${record.principal.authority}" but "${query.requiredLevel}" is required`,
      );
    }
  }

  /**
   * Validate that a Principal object has all required fields and sane values.
   */
  private static validatePrincipal(principal: Principal): void {
    if (!principal.id || principal.id.trim().length === 0) {
      throw new Error('Principal id must be a non-empty string');
    }
    if (!principal.name || principal.name.trim().length === 0) {
      throw new Error('Principal name must be a non-empty string');
    }
    if (!principal.contact || principal.contact.trim().length === 0) {
      throw new Error('Principal contact must be a non-empty string');
    }
    if (!AUTHORITY_RANK.has(principal.authority)) {
      throw new Error(`Invalid authority level: ${String(principal.authority)}`);
    }
  }
}
