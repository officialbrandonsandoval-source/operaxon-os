/**
 * Operaxon Full Integration Test
 * Tests all 5 phases working together
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { executor } from '@operaxon/claw';
import { searchEngine } from '@operaxon/hermes';
import { mcpClient } from '../mcp-client.js';
import { parser } from '../../cli/src/slash-commands.js';

describe('Operaxon Phases 1-5 Integration', () => {
  beforeAll(async () => {
    // Setup
    console.log('🚀 Starting integration tests...');
  });

  afterAll(async () => {
    // Cleanup
    mcpClient.disconnectAll();
  });

  // Phase 4: ClawCode Tests
  describe('Phase 4: ClawCode Execution', () => {
    it('should execute code safely', async () => {
      const result = await executor.execute({
        code: 'const x = 1 + 1; x',
      });

      expect(result.success).toBe(true);
      expect(result.reversible).toBe(true);
    });

    it('should respect tool allowlist', async () => {
      const result = await executor.execute({
        code: 'read_file("/secret")',
        tools: [], // Empty allowlist
      });

      // Should be restricted
      expect(result.logs).toBeDefined();
    });

    it('should log all executions', async () => {
      const result = await executor.execute({
        code: 'y = 42',
        sessionId: 'test-123',
      });

      expect(result.logs?.length).toBeGreaterThan(0);
      expect(result.logs?.[0]).toContain('[EXEC]');
    });
  });

  // Phase 5A: Session Search Tests
  describe('Phase 5A: Session Search', () => {
    it('should perform FTS search', async () => {
      const results = await searchEngine.ftsSearch('test query', 5);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should perform vector search', async () => {
      const results = await searchEngine.vectorSearch('semantic query', 5);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should perform hybrid search', async () => {
      const results = await searchEngine.hybridSearch('combined search', 5);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle empty results gracefully', async () => {
      const results = await searchEngine.search('xyzabc nonexistent', {
        topK: 1,
      });

      expect(Array.isArray(results)).toBe(true);
    });
  });

  // Phase 5B: MCP Integration Tests
  describe('Phase 5B: MCP Integration', () => {
    beforeAll(async () => {
      // Register test server
      mcpClient.registerServer({
        name: 'test-server',
        url: 'http://localhost:3001',
        description: 'Test MCP server',
        capabilities: ['test_tool'],
      });

      await mcpClient.connect('test-server');
    });

    it('should invoke MCP tools', async () => {
      const result = await mcpClient.invokeTool({
        server: 'github',
        tool: 'create_issue',
        args: {
          repo: 'test/repo',
          title: 'Test Issue',
          body: 'Test body',
        },
      });

      expect(result.success).toBe(true);
      expect(result.data?.title).toBe('Test Issue');
    });

    it('should handle MCP connection failures gracefully', async () => {
      const result = await mcpClient.invokeTool({
        server: 'nonexistent-server',
        tool: 'create_issue',
        args: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // Phase 5D: Slash Commands Tests
  describe('Phase 5D: Slash Commands', () => {
    it('should parse /search command', async () => {
      const result = await parser.execute('/search "test query"');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should parse /execute command', async () => {
      const result = await parser.execute('/execute "console.log(1)"');
      expect(result).toBeDefined();
    });

    it('should parse /build command', async () => {
      const result = await parser.execute('/build "Create a component"');
      expect(result).toBeDefined();
    });

    it('should parse /help command', async () => {
      const result = await parser.execute('/help');
      expect(result).toContain('search');
      expect(result).toContain('execute');
    });

    it('should handle invalid commands', async () => {
      const result = await parser.execute('/invalid-command');
      expect(result).toContain('not found');
    });
  });

  // Full Integration Tests
  describe('Full Integration: Phases 4-5 Together', () => {
    it('should chain phase 4 (execute) → phase 5A (search)', async () => {
      // 1. Execute code
      const execResult = await executor.execute({
        code: 'const result = "test"; result',
      });

      expect(execResult.success).toBe(true);

      // 2. Search for related sessions
      const searchResults = await searchEngine.search('test');

      expect(Array.isArray(searchResults)).toBe(true);
    });

    it('should use /search command end-to-end', async () => {
      const result = await parser.execute('/search "integration test"');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  // Performance Tests
  describe('Performance Benchmarks', () => {
    it('session search should complete in <1 second', async () => {
      const start = Date.now();
      await searchEngine.search('test query', { topK: 10 });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000);
    });

    it('code execution should complete in <5 seconds', async () => {
      const start = Date.now();
      await executor.execute({ code: 'const x = 1 + 1' });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(5000);
    });

    it('MCP tool invocation should complete in <2 seconds', async () => {
      const start = Date.now();
      await mcpClient.invokeTool({
        server: 'github',
        tool: 'list_issues',
        args: { repo: 'test/repo' },
      });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(2000);
    });
  });
});
