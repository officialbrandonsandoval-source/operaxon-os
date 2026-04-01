/**
 * Linear MCP Tool Wrapper
 * 
 * Integrates Linear via MCP protocol.
 * Allows agents to: create issues, list projects, manage cycles
 */

import { mcpClient } from '../mcp-client.js';

export const linearMCPTool = {
  name: 'mcp_linear',
  description:
    'Linear operations via MCP: create issues, manage projects, track cycles',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['create_issue', 'list_issues', 'update_issue', 'list_projects'],
        description: 'The Linear action to perform',
      },
      teamId: {
        type: 'string',
        description: 'Linear team ID',
      },
      title: {
        type: 'string',
        description: 'Issue title',
      },
      description: {
        type: 'string',
        description: 'Issue description',
      },
      priority: {
        type: 'string',
        enum: ['urgent', 'high', 'medium', 'low'],
        description: 'Issue priority',
      },
      assigneeId: {
        type: 'string',
        description: 'User ID to assign to',
      },
    },
    required: ['action', 'teamId'],
  },
};

export async function handleLinearMCP(input: {
  action: string;
  teamId: string;
  title?: string;
  description?: string;
  priority?: string;
  assigneeId?: string;
}) {
  // Ensure connected
  if (!mcpClient.listConnectedServers().includes('linear')) {
    await mcpClient.connect('linear');
  }

  const result = await mcpClient.invokeTool({
    server: 'linear',
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

export function registerLinearMCPTool(runtime: any): void {
  // Register Linear server with MCP client
  mcpClient.registerServer({
    name: 'linear',
    url: 'http://localhost:3002', // Linear MCP server
    description: 'Linear via Model Context Protocol',
    capabilities: ['create_issue', 'list_issues', 'update_issue', 'list_projects'],
  });

  // Register tool with runtime
  runtime.registerTool('mcp_linear', handleLinearMCP, linearMCPTool);
  console.log('[Linear MCP] Tool registered');
}
