/**
 * Operaxon Tool Wrapper for ClawCode
 * 
 * Exposes ClawCode executor as an Operaxon tool that can be invoked
 * from the agent via the standard tool system.
 */

import { executor, ExecutionRequest, ExecutionResult } from './executor.js';

/**
 * Tool definition for Operaxon tool system
 */
export const clawCodeTool = {
  name: 'claw_execute',
  description:
    'Execute code safely and auditably via ClawCode harness. All code execution is logged, reversible, and sandboxed.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      code: {
        type: 'string',
        description: 'The code to execute (Python, JavaScript, Bash, etc.)',
      },
      model: {
        type: 'string',
        enum: ['opus', 'sonnet', 'haiku'],
        description: 'Which Claude model to use for reasoning. Default: sonnet',
      },
      tools: {
        type: 'array',
        items: { type: 'string' },
        description:
          'List of tools to allow (read_file, write_file, run_command, git_commit, github_api, linear_api)',
      },
      maxTokens: {
        type: 'number',
        description: 'Max tokens for execution. Model-specific limits apply.',
      },
      sandbox: {
        type: 'boolean',
        description: 'Run in isolated sandbox? Default: true',
      },
      timeout: {
        type: 'number',
        description: 'Execution timeout in seconds. Default: 30',
      },
    },
    required: ['code'],
  },
};

/**
 * Tool handler — called by Operaxon when agent invokes claw_execute
 */
export async function handleClawExecute(input: {
  code: string;
  model?: string;
  tools?: string[];
  maxTokens?: number;
  sandbox?: boolean;
  timeout?: number;
}): Promise<ExecutionResult> {
  // Validate input
  if (!input.code) {
    return {
      success: false,
      error: 'code is required',
      executionTime: 0,
    };
  }

  // Build execution request
  const req: ExecutionRequest = {
    code: input.code,
    model: (input.model as any) || 'sonnet',
    tools: input.tools,
    maxTokens: input.maxTokens,
    sandbox: input.sandbox !== false,
    timeout: input.timeout,
  };

  // Execute via ClawCode
  const result = await executor.execute(req);

  // Return result in format Operaxon expects
  return {
    ...result,
    // Add Operaxon-specific metadata
  };
}

/**
 * Undo handler — called by Operaxon if agent needs to roll back execution
 */
export async function handleClawUndo(input: {
  executionId: string;
}): Promise<{ success: boolean; message: string }> {
  const success = await executor.undo(input.executionId);

  return {
    success,
    message: success
      ? `Execution ${input.executionId} reversed`
      : `Failed to reverse execution ${input.executionId}`,
  };
}

/**
 * Register tool with Operaxon runtime
 */
export function registerClawCodeTool(runtime: any): void {
  runtime.registerTool(clawCodeTool.name, handleClawExecute, clawCodeTool);
  runtime.registerTool('claw_undo', handleClawUndo, {
    name: 'claw_undo',
    description: 'Undo a previous code execution',
    inputSchema: {
      type: 'object',
      properties: {
        executionId: {
          type: 'string',
          description: 'The execution ID to undo',
        },
      },
      required: ['executionId'],
    },
  });

  console.log('[ClawCode] Tool registered with Operaxon runtime');
}
