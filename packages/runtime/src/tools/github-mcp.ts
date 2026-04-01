/**
 * GitHub MCP Tool Wrapper
 * 
 * Integrates GitHub via MCP protocol.
 * Allows agents to: create issues, list PRs, search code, commit
 */

import { mcpClient } from '../mcp-client.js';

export const gitHubMCPTool = {
  name: 'mcp_github',
  description:
    'GitHub operations via MCP: create issues, list PRs, search code, commit',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['create_issue', 'list_issues', 'search_code', 'create_pr'],
        description: 'The GitHub action to perform',
      },
      repo: {
        type: 'string',
        description: 'Repository in format owner/repo',
      },
      title: {
        type: 'string',
        description: 'Issue or PR title',
      },
      body: {
        type: 'string',
        description: 'Issue or PR body/description',
      },
      query: {
        type: 'string',
        description: 'Search query (for search_code)',
      },
      labels: {
        type: 'array',
        items: { type: 'string' },
        description: 'Labels to add',
      },
    },
    required: ['action', 'repo'],
  },
};

export async function handleGitHubMCP(input: {
  action: string;
  repo: string;
  title?: string;
  body?: string;
  query?: string;
  labels?: string[];
}) {
  // Ensure connected
  if (!mcpClient.listConnectedServers().includes('github')) {
    await mcpClient.connect('github');
  }

  const result = await mcpClient.invokeTool({
    server: 'github',
    tool: input.action,
    args: input,
  });

  return {
    success: result.success,
    data: result.data,
    error: result.error,
    executionTime: result.executionTime,
  };
}

export function registerGitHubMCPTool(runtime: any): void {
  // Register GitHub server with MCP client
  mcpClient.registerServer({
    name: 'github',
    url: 'http://localhost:3001', // GitHub MCP server
    description: 'GitHub via Model Context Protocol',
    capabilities: ['create_issue', 'list_issues', 'search_code', 'create_pr'],
  });

  // Register tool with runtime
  runtime.registerTool('mcp_github', handleGitHubMCP, gitHubMCPTool);
  console.log('[GitHub MCP] Tool registered');
}
