// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

import { describe, it, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditLog } from './audit.js';

function makeEntry() {
  return {
    timestamp: new Date().toISOString(),
    agent: 'agent-001',
    action: 'read_memory',
    outcome: 'success' as const,
    metadata: { key: 'value' },
  };
}

describe('AuditLog', () => {
  let basePath: string;
  let signingKey: Buffer;
  let log: AuditLog;

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), 'audit-test-'));
    signingKey = randomBytes(32);
    log = new AuditLog(basePath, signingKey);
  });

  it('append creates valid entry with signature', async () => {
    const entry = await log.append(makeEntry());
    assert.ok(entry.id, 'entry should have an id');
    assert.ok(entry.signature, 'entry should have a signature');
    assert.equal(typeof entry.signature, 'string');
    assert.ok(entry.signature.length > 0, 'signature should be non-empty');
    assert.equal(entry.agent, 'agent-001');
    assert.equal(entry.action, 'read_memory');
  });

  it('entries have unique IDs', async () => {
    const entry1 = await log.append(makeEntry());
    const entry2 = await log.append(makeEntry());
    assert.notEqual(entry1.id, entry2.id);
  });

  it('verify passes for untampered log', async () => {
    await log.append(makeEntry());
    await log.append(makeEntry());
    await log.append(makeEntry());
    const result = await log.verify();
    assert.equal(result.valid, true);
    assert.equal(result.invalidEntries.length, 0);
  });

  it('verify fails when entry is modified (tamper detection)', async () => {
    await log.append(makeEntry());
    await log.append(makeEntry());

    // Tamper with the log file — change an action field
    const logPath = join(basePath, 'audit.log');
    const content = await readFile(logPath, 'utf8');
    const lines = content.trim().split('\n');
    const parsed = JSON.parse(lines[0]!);
    parsed.action = 'TAMPERED_ACTION';
    lines[0] = JSON.stringify(parsed);
    await writeFile(logPath, lines.join('\n') + '\n', 'utf8');

    const result = await log.verify();
    assert.equal(result.valid, false);
    assert.ok(result.invalidEntries.length > 0);
  });

  it('verify fails when entry is deleted (chain broken)', async () => {
    await log.append(makeEntry());
    await log.append(makeEntry());
    await log.append(makeEntry());

    // Delete the middle entry
    const logPath = join(basePath, 'audit.log');
    const content = await readFile(logPath, 'utf8');
    const lines = content.trim().split('\n');
    const withoutMiddle = [lines[0]!, lines[2]!];
    await writeFile(logPath, withoutMiddle.join('\n') + '\n', 'utf8');

    const result = await log.verify();
    assert.equal(result.valid, false);
    assert.ok(result.invalidEntries.length > 0);
  });

  it('verify fails when entry order is changed', async () => {
    await log.append(makeEntry());
    await log.append(makeEntry());
    await log.append(makeEntry());

    // Swap first and last entries
    const logPath = join(basePath, 'audit.log');
    const content = await readFile(logPath, 'utf8');
    const lines = content.trim().split('\n');
    const swapped = [lines[2]!, lines[1]!, lines[0]!];
    await writeFile(logPath, swapped.join('\n') + '\n', 'utf8');

    const result = await log.verify();
    assert.equal(result.valid, false);
    assert.ok(result.invalidEntries.length > 0);
  });

  it('log is append-only (entries accumulate)', async () => {
    await log.append(makeEntry());
    await log.append(makeEntry());

    const logPath = join(basePath, 'audit.log');
    const content = await readFile(logPath, 'utf8');
    const lines = content.trim().split('\n');
    assert.equal(lines.length, 2);

    await log.append(makeEntry());
    const content2 = await readFile(logPath, 'utf8');
    const lines2 = content2.trim().split('\n');
    assert.equal(lines2.length, 3);
  });

  it('concurrent appends maintain integrity', async () => {
    // Append multiple entries concurrently
    const promises = Array.from({ length: 5 }, () => log.append(makeEntry()));
    const entries = await Promise.all(promises);

    // All entries should have unique IDs
    const ids = new Set(entries.map(e => e.id));
    assert.equal(ids.size, 5);

    // All entries should have signatures
    for (const entry of entries) {
      assert.ok(entry.signature.length > 0);
    }
  });

  it('signatures chain correctly via previousHash', async () => {
    const entry1 = await log.append(makeEntry());
    const entry2 = await log.append(makeEntry());
    // The second entry's chain depends on the first — different signatures
    assert.notEqual(entry1.signature, entry2.signature);
  });
});
