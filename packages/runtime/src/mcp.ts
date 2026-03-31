// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

export interface MCPTool {
  name: string;
  description: string;
  parameters: MCPParameter[];
  handler: (params: Record<string, unknown>) => Promise<MCPResult>;
}

export interface MCPParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export interface MCPResult {
  success: boolean;
  output: unknown;
  error?: string;
}

export class MCPServer {
  private tools: Map<string, MCPTool> = new Map();

  registerTool(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
  }

  listTools(): MCPToolInfo[] {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  async executeTool(name: string, params: Record<string, unknown>): Promise<MCPResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, output: null, error: `Tool not found: ${name}` };
    }

    // Validate required parameters
    for (const param of tool.parameters) {
      if (param.required && !(param.name in params)) {
        return { success: false, output: null, error: `Missing required parameter: ${param.name}` };
      }
    }

    try {
      return await tool.handler(params);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, output: null, error: message };
    }
  }
}

export interface MCPToolInfo {
  name: string;
  description: string;
  parameters: MCPParameter[];
}
