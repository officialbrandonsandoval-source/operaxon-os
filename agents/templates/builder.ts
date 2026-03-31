/**
 * Builder Agent Template
 *
 * A builder agent that handles code generation, file creation,
 * and technical construction tasks.
 */

import type { AgentMessage } from '../../packages/runtime/types';

export interface BuilderAgentConfig {
  name: string;
  workingDir?: string;
  allowedFileTypes?: string[];
  maxFileSizeBytes?: number;
}

export interface BuildTask {
  id: string;
  type: 'create-file' | 'modify-file' | 'run-command' | 'scaffold-project';
  description: string;
  payload: Record<string, unknown>;
}

export interface BuildResult {
  taskId: string;
  success: boolean;
  output?: string;
  error?: string;
  artifacts?: string[];
}

export class BuilderAgent {
  private tasks: BuildTask[] = [];

  constructor(private config: BuilderAgentConfig) {
    console.log(`[Builder] Agent "${config.name}" initialized`);
  }

  /**
   * Process an incoming message and extract build intent
   */
  async processMessage(message: AgentMessage): Promise<string> {
    const content = message.content.toLowerCase();

    if (content.includes('create') || content.includes('build') || content.includes('make')) {
      return this.handleBuildRequest(message.content);
    }

    if (content.includes('status') || content.includes('progress')) {
      return this.getStatus();
    }

    if (content.includes('help')) {
      return this.getHelp();
    }

    return `Builder agent "${this.config.name}" received: "${message.content}". Send "help" for available commands.`;
  }

  private async handleBuildRequest(request: string): Promise<string> {
    const task: BuildTask = {
      id: `task-${Date.now()}`,
      type: 'scaffold-project',
      description: request,
      payload: { request },
    };

    this.tasks.push(task);

    return [
      `✅ Build task queued: ${task.id}`,
      `📋 Task: ${task.description.substring(0, 100)}`,
      `⏳ Processing... (implement LLM integration to handle this task)`,
      ``,
      `To integrate AI: connect this agent to Anthropic/OpenAI API`,
      `and pass message history to generate code/file outputs.`,
    ].join('\n');
  }

  private getStatus(): string {
    return [
      `📊 Builder Status`,
      `Agent: ${this.config.name}`,
      `Tasks queued: ${this.tasks.length}`,
      `Working dir: ${this.config.workingDir || process.cwd()}`,
    ].join('\n');
  }

  private getHelp(): string {
    return [
      `🔨 Builder Agent — Available Commands`,
      ``,
      `build/create/make <description> — Queue a build task`,
      `status — Show agent status`,
      `help — Show this message`,
      ``,
      `Examples:`,
      `  "Create a REST API with Express"`,
      `  "Build a React component for a dashboard"`,
      `  "Make a CLI tool that reads JSON files"`,
    ].join('\n');
  }
}

// Default export for quick instantiation
export default BuilderAgent;
