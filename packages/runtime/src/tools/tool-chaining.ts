/**
 * Tool Chaining — Phase 5B
 * 
 * Enables agents to chain multiple tool calls together.
 * Example: Linear issue → Create GitHub issue from it → Post to Slack
 */

import { mcpClient } from '../mcp-client.js';

export interface ChainStep {
  tool: string;
  args: Record<string, any>;
  mapOutputTo?: Record<string, string>; // Map output field to next step input
}

export interface ToolChain {
  steps: ChainStep[];
  name: string;
  description: string;
}

export class ToolChainExecutor {
  /**
   * Execute a chain of tool calls
   * Each step's output can be passed to the next step's input
   */
  async executeChain(chain: ToolChain): Promise<any> {
    console.log(`[ToolChain] Executing: ${chain.name}`);
    
    let previousOutput: Record<string, any> = {};
    const results: any[] = [];

    for (let i = 0; i < chain.steps.length; i++) {
      const step = chain.steps[i];
      console.log(`  Step ${i + 1}/${chain.steps.length}: ${step.tool}`);

      // Map previous output to this step's input
      let args = { ...step.args };
      if (step.mapOutputTo) {
        for (const [outputField, inputField] of Object.entries(
          step.mapOutputTo
        )) {
          if (previousOutput[outputField] !== undefined) {
            args[inputField] = previousOutput[outputField];
          }
        }
      }

      // Execute step
      const [server, tool] = step.tool.split('.');
      const result = await mcpClient.invokeTool({
        server,
        tool,
        args,
      });

      if (!result.success) {
        console.error(`  ❌ Step failed: ${result.error}`);
        return {
          success: false,
          error: `Chain failed at step ${i + 1}: ${result.error}`,
          results,
        };
      }

      console.log(`  ✅ Step succeeded`);
      previousOutput = result.data || {};
      results.push({
        step: i + 1,
        tool: step.tool,
        output: previousOutput,
      });
    }

    console.log(`[ToolChain] ✅ Completed: ${chain.name}`);
    return {
      success: true,
      data: previousOutput,
      results,
    };
  }
}

export const toolChainExecutor = new ToolChainExecutor();

/**
 * Example: Linear ticket → GitHub issue → Slack notification
 */
export const linearToGitHubChain: ToolChain = {
  name: 'linear-to-github-to-slack',
  description:
    'Create a GitHub issue from a Linear ticket and notify on Slack',
  steps: [
    {
      tool: 'linear.list_issues',
      args: {
        teamId: 'engineering',
        filter: { state: 'todo' },
      },
      mapOutputTo: {
        'results[0].id': 'issueId',
      },
    },
    {
      tool: 'github.create_issue',
      args: {
        repo: 'myorg/myrepo',
        // title and body will be mapped from previous step
      },
      mapOutputTo: {
        'results[0].title': 'title',
        'results[0].description': 'body',
      },
    },
    {
      tool: 'slack.post_message',
      args: {
        channel: '#engineering',
        // URL will be mapped from GitHub result
      },
      mapOutputTo: {
        url: 'text',
      },
    },
  ],
};
