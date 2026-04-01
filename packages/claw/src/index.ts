/**
 * @operaxon/claw — Audited Code Execution for Operaxon
 * 
 * Phase 4 Integration: ClawCode Harness
 * 
 * Provides safe, audited code execution with:
 * - Security via tool allowlisting
 * - Execution logging for auditability
 * - Sandbox isolation
 * - Reversibility (undo support)
 */

export { ClawCodeExecutor, executor } from './executor.js';
export type { ExecutionRequest, ExecutionResult } from './executor.js';

export {
  clawCodeTool,
  handleClawExecute,
  handleClawUndo,
  registerClawCodeTool,
} from './tool-wrapper.js';
