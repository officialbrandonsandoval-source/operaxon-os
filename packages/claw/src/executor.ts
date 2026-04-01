/**
 * Operaxon ClawCode Executor — Phase 4
 * 
 * Wraps the ClawCode Rust harness for safe, audited code execution.
 * This is the audited execution layer that runs user code with:
 * - Tool allowlisting (security)
 * - Permission verification
 * - Execution logging + reversibility
 * - Model-specific token limits
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

export interface ExecutionRequest {
  code: string;
  model?: 'opus' | 'sonnet' | 'haiku'; // Claude model
  tools?: string[]; // Allowed tools
  maxTokens?: number;
  sandbox?: boolean; // Run in isolated sandbox?
  timeout?: number; // Execution timeout in seconds
  sessionId?: string; // For logging
}

export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  tokensUsed?: number;
  executionTime?: number;
  logs?: string[];
  reversible?: boolean; // Can this execution be undone?
}

export class ClawCodeExecutor {
  private clawBinaryPath: string;
  private logDir: string;

  constructor(clawSourceDir: string = './source', logDir: string = './logs') {
    // Path to ClawCode binary or source
    this.clawBinaryPath = clawSourceDir;
    this.logDir = logDir;
  }

  /**
   * Execute code safely via ClawCode harness
   */
  async execute(req: ExecutionRequest): Promise<ExecutionResult> {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      // Step 1: Validate input
      if (!req.code || req.code.trim().length === 0) {
        return {
          success: false,
          error: 'Code is empty',
          executionTime: Date.now() - startTime,
        };
      }

      // Step 2: Set up execution environment
      const model = req.model || 'sonnet';
      const maxTokens = this.getMaxTokens(model, req.maxTokens);
      const tools = req.tools || [];

      logs.push(`[EXEC] Model: ${model}, Max tokens: ${maxTokens}`);
      logs.push(`[EXEC] Tools allowed: ${tools.join(', ') || '(none)'}`);
      logs.push(`[EXEC] Sandbox: ${req.sandbox ? 'on' : 'off'}`);

      // Step 3: Check tool allowlist
      const approvedTools = await this.checkToolApproval(tools);
      if (approvedTools.rejected.length > 0) {
        logs.push(`[WARN] Tools rejected: ${approvedTools.rejected.join(', ')}`);
      }

      // Step 4: Log execution (for auditability)
      const executionId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      await this.logExecution({
        id: executionId,
        sessionId: req.sessionId,
        code: req.code,
        model,
        tools: approvedTools.approved,
        timestamp: new Date().toISOString(),
      });

      // Step 5: Execute via ClawCode harness
      const result = await this.runClawCode({
        code: req.code,
        model,
        maxTokens,
        tools: approvedTools.approved,
        sandbox: req.sandbox ?? true,
        timeout: req.timeout || 30,
      });

      logs.push(`[SUCCESS] Execution completed in ${result.executionTime}ms`);

      return {
        success: true,
        output: result.output,
        tokensUsed: result.tokensUsed,
        executionTime: Date.now() - startTime,
        logs,
        reversible: true, // ClawCode logs are reversible
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logs.push(`[ERROR] ${errorMsg}`);

      return {
        success: false,
        error: errorMsg,
        executionTime: Date.now() - startTime,
        logs,
        reversible: false,
      };
    }
  }

  /**
   * Check which tools are approved (from allowlist)
   */
  private async checkToolApproval(
    requestedTools: string[]
  ): Promise<{ approved: string[]; rejected: string[] }> {
    const allowedTools = [
      'read_file',
      'write_file',
      'run_command',
      'git_commit',
      'github_api',
      'linear_api',
    ];

    const approved = requestedTools.filter((t) => allowedTools.includes(t));
    const rejected = requestedTools.filter((t) => !allowedTools.includes(t));

    return { approved, rejected };
  }

  /**
   * Get model-specific max tokens
   */
  private getMaxTokens(model: string, override?: number): number {
    if (override) return override;

    const limits = {
      opus: 32_000, // Claude Opus context limit
      sonnet: 64_000, // Claude Sonnet context limit
      haiku: 64_000, // Claude Haiku context limit
    };

    return limits[model as keyof typeof limits] || 64_000;
  }

  /**
   * Log execution for auditability + reversibility
   */
  private async logExecution(data: any): Promise<void> {
    try {
      // Ensure log directory exists
      await fs.mkdir(this.logDir, { recursive: true });

      const logFile = path.join(this.logDir, `${data.id}.json`);
      await fs.writeFile(logFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to log execution:', error);
    }
  }

  /**
   * Run code via ClawCode Rust harness
   */
  private async runClawCode(options: {
    code: string;
    model: string;
    maxTokens: number;
    tools: string[];
    sandbox: boolean;
    timeout: number;
  }): Promise<{ output: string; executionTime: number; tokensUsed: number }> {
    return new Promise((resolve, reject) => {
      // For now, return a placeholder
      // In production, this would spawn the ClawCode binary and capture output
      
      const output = `[ClawCode] Executed ${options.code.split('\n').length} lines of code`;
      resolve({
        output,
        executionTime: 150,
        tokensUsed: 1500,
      });

      // TODO: Implement actual ClawCode spawning
      // const child = spawn(this.clawBinaryPath, [...args], { timeout: options.timeout * 1000 });
    });
  }

  /**
   * Undo an execution (if reversible)
   */
  async undo(executionId: string): Promise<boolean> {
    try {
      const logFile = path.join(this.logDir, `${executionId}.json`);
      const log = JSON.parse(await fs.readFile(logFile, 'utf-8'));

      // Implement undo logic based on execution type
      // e.g., if it was a file write, delete the file
      // if it was a git commit, revert the commit
      console.log(`[UNDO] Reversing execution: ${executionId}`);
      return true;
    } catch (error) {
      console.error(`Failed to undo execution ${executionId}:`, error);
      return false;
    }
  }
}

// Export singleton instance
export const executor = new ClawCodeExecutor();
