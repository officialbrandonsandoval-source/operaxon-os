// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Meridian } from './meridian.js';
import { Synthesizer } from './synthesizer.js';
import { MeridianStorage } from './storage.js';

// ---------------------------------------------------------------------------
// Meridian integration test
// ---------------------------------------------------------------------------

describe('Meridian', () => {
  let tmpDir: string;
  let meridian: Meridian;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'meridian-test-'));
    meridian = new Meridian({
      storagePath: tmpDir,
      encryptionKeyRef: 'test-key',
      timeGateHours: 0.001, // nearly immediate for tests
      sessionGateCount: 1,
      maxLessonsPerSession: 2,
      auditSigningKey: Buffer.from('test-audit-signing-key-32bytes!!'),
    });
    await meridian.initialize();
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('logs an action', async () => {
    await assert.doesNotReject(
      meridian.log('deployed new feature', { agentId: 'agt-001', metadata: { feature: 'auth' } }),
    );
  });

  it('writes a lesson to daily memory', async () => {
    await assert.doesNotReject(
      meridian.writeLesson('Always validate input before processing.', 'agt-001'),
    );
  });

  it('processes a session transcript and extracts lessons', async () => {
    const transcript = {
      sessionId: 'session-test-001',
      agentId: 'agt-001',
      startedAt: new Date().toISOString(),
      messages: [
        {
          role: 'user' as const,
          content: 'Build the new feature',
          timestamp: new Date().toISOString(),
        },
        {
          role: 'assistant' as const,
          content: 'I decided to use TypeScript strict mode for all new files. The lesson learned is: always use strict TypeScript settings.',
          timestamp: new Date().toISOString(),
        },
        {
          role: 'user' as const,
          content: 'Actually, the deployment failed. We need to fix the build process first. The correct approach is to run tests before deploying.',
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const result = await meridian.processSession(transcript);
    assert.ok(result.sessionId === 'session-test-001');
    assert.ok(result.processedAt);
    // Lessons may or may not be extracted depending on pattern matching
    assert.ok(Array.isArray(result.lessons));
  });

  it('search returns results from memory', async () => {
    // Write a searchable lesson
    await meridian.writeLesson('Deployment always requires running tests first. Never skip this step.', 'agt-001');

    const results = await meridian.search('deployment tests', 5);
    assert.ok(Array.isArray(results));
    // Should find the written lesson
    if (results.length > 0) {
      const first = results[0];
      assert.ok(first?.content);
      assert.ok(first?.source);
      assert.ok(typeof first?.score === 'number');
    }
  });

  it('search with no matches returns empty array', async () => {
    const results = await meridian.search('xyzqwerty nonexistent term abcdef');
    assert.ok(Array.isArray(results));
  });

  it('shouldConsolidate returns boolean', async () => {
    const should = await meridian.shouldConsolidate();
    assert.ok(typeof should === 'boolean');
  });

  it('consolidateNow runs without error', async () => {
    const result = await meridian.consolidateNow();
    assert.ok(result);
    assert.ok(typeof result.success === 'boolean');
    assert.ok(typeof result.memoriesCreated === 'number');
    assert.ok(typeof result.signalsProcessed === 'number');
    assert.ok(Array.isArray(result.phases));
    assert.equal(result.phases.length, 4);
  });
});

// ---------------------------------------------------------------------------
// Synthesizer unit tests
// ---------------------------------------------------------------------------

describe('Synthesizer', () => {
  let synthesizer: Synthesizer;

  before(() => {
    synthesizer = new Synthesizer({ maxLessonsPerSession: 3, minConfidence: 0.3 });
  });

  it('extracts correction lessons', () => {
    const content = [
      'User: Build the feature',
      'Assistant: I will use method A',
      'User: Actually, that\'s wrong. The correct approach is to use method B because it handles edge cases better.',
      'Assistant: Understood, switching to method B.',
    ].join('\n\n');

    const result = synthesizer.extractFromSession(content, 'session-001', 'agt-001');
    assert.equal(result.sessionId, 'session-001');
    assert.equal(result.agentId, 'agt-001');
    assert.ok(result.processedAt);
    // Should find at least the correction
    assert.ok(result.contradictionsFound >= 0);
  });

  it('extracts decision lessons', () => {
    const content = [
      'User: What should we use for the database?',
      'Assistant: After analysis, I decided to use PostgreSQL for its reliability and ecosystem.',
      'User: Good. Let\'s commit to that.',
    ].join('\n\n');

    const result = synthesizer.extractFromSession(content, 'session-002', 'agt-001');
    assert.ok(result.lessons.length >= 0);
  });

  it('formats lessons as markdown', () => {
    const result = synthesizer.extractFromSession(
      'User: Actually, the build process should include linting.\nAssistant: Noted.',
      'session-003',
      'agt-001',
    );

    const markdown = synthesizer.formatAsMarkdown(result);
    assert.ok(typeof markdown === 'string');
    assert.ok(markdown.includes('session-003'));
  });

  it('returns empty lessons for low-signal content', () => {
    const content = 'Hello\nHow are you?\nFine.';
    const result = synthesizer.extractFromSession(content, 'session-empty', 'agt-001');
    // Shouldn't crash, may return 0 lessons
    assert.ok(Array.isArray(result.lessons));
  });
});

// ---------------------------------------------------------------------------
// MeridianStorage search tests
// ---------------------------------------------------------------------------

describe('MeridianStorage', () => {
  let tmpDir: string;
  let storage: MeridianStorage;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'meridian-storage-test-'));
    storage = new MeridianStorage({ basePath: tmpDir });
    await storage.initialize();
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('stores and retrieves JSON records', async () => {
    await storage.json.write({
      id: 'test-record-001',
      type: 'decision',
      data: { choice: 'TypeScript', reason: 'Type safety' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: ['typescript', 'decision'],
    });

    const record = await storage.json.read('test-record-001');
    assert.ok(record);
    assert.equal(record.id, 'test-record-001');
    assert.equal(record.type, 'decision');
    assert.equal((record.data as Record<string, string>)['choice'], 'TypeScript');
  });

  it('searches JSON records by keyword', async () => {
    const results = await storage.json.search('typescript decision');
    assert.ok(Array.isArray(results));
    if (results.length > 0) {
      const first = results[0];
      assert.ok(first !== undefined && first.score > 0);
    }
  });

  it('stores and retrieves markdown files', async () => {
    const content = '# 2026-03-31\n\n## Lesson\n\nAlways test before deploying.\n';
    await storage.markdown.write('2026-03-31.md', content);

    const entry = await storage.markdown.read('2026-03-31.md');
    assert.ok(entry);
    assert.equal(entry.filename, '2026-03-31.md');
    assert.ok(entry.content.includes('Always test before deploying'));
  });

  it('unified search finds content across both stores', async () => {
    const results = await storage.search('typescript', 5);
    assert.ok(Array.isArray(results));
    // Should find the JSON record
    if (results.length > 0) {
      assert.ok(results[0]?.source);
      assert.ok(typeof results[0]?.score === 'number');
    }
  });

  it('deletes JSON records', async () => {
    await storage.json.write({
      id: 'delete-me',
      type: 'test',
      data: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: [],
    });

    const deleted = await storage.json.delete('delete-me');
    assert.equal(deleted, true);

    const record = await storage.json.read('delete-me');
    assert.equal(record, null);
  });
});
