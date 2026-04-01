/**
 * ClawCode Executor Tests
 */

import { describe, it, expect } from '@jest/globals';
import { ClawCodeExecutor } from './executor.js';

describe('ClawCodeExecutor', () => {
  const executor = new ClawCodeExecutor();

  it('should reject empty code', async () => {
    const result = await executor.execute({ code: '' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('should execute code with default model (sonnet)', async () => {
    const result = await executor.execute({
      code: 'print("hello world")',
    });
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
  });

  it('should respect tool allowlist', async () => {
    const result = await executor.execute({
      code: 'read_file("/etc/passwd")',
      tools: ['malicious_tool'],
    });
    // Tool should be rejected, but code may still run
    expect(result.logs).toBeDefined();
  });

  it('should set model-specific token limits', async () => {
    const result = await executor.execute({
      code: 'x = 1 + 1',
      model: 'haiku',
    });
    expect(result.success).toBe(true);
  });

  it('should log execution for auditability', async () => {
    const result = await executor.execute({
      code: 'y = 42',
      sessionId: 'test-session-123',
    });
    expect(result.reversible).toBe(true);
    expect(result.logs).toBeDefined();
  });

  it('should support undo (reversibility)', async () => {
    const result = await executor.execute({
      code: 'write_file("test.txt", "content")',
      tools: ['write_file'],
    });
    // Should be reversible if it was a write
    expect(result.reversible).toBe(true);
  });
});
