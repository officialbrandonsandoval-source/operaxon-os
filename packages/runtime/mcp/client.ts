import axios, { AxiosInstance } from 'axios';

export interface MCPTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface MCPToolCall {
  tool: string;
  parameters: Record<string, unknown>;
}

export interface MCPToolResult {
  tool: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * MCPClient — Model Context Protocol client
 * Connects to an MCP server to discover and invoke tools.
 * Spec: https://spec.modelcontextprotocol.io/
 */
export class MCPClient {
  private client: AxiosInstance;
  private tools: Map<string, MCPTool> = new Map();
  private connected = false;

  constructor(private serverUrl: string) {
    this.client = axios.create({
      baseURL: serverUrl,
      timeout: 30_000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
  }

  async connect(): Promise<void> {
    try {
      const res = await this.client.get('/tools');
      const tools: MCPTool[] = res.data.tools || [];
      tools.forEach((t) => this.tools.set(t.name, t));
      this.connected = true;
      console.log(`[MCP] Connected to ${this.serverUrl} — ${tools.length} tools available`);
    } catch (err) {
      console.warn(`[MCP] Could not connect to ${this.serverUrl} — running without MCP`);
      this.connected = false;
    }
  }

  async call(toolName: string, parameters: Record<string, unknown>): Promise<MCPToolResult> {
    if (!this.connected) {
      return { tool: toolName, success: false, error: 'MCP not connected' };
    }

    const tool = this.tools.get(toolName);
    if (!tool) {
      return { tool: toolName, success: false, error: `Tool "${toolName}" not found` };
    }

    try {
      const res = await this.client.post('/tools/call', {
        tool: toolName,
        parameters,
      });

      return {
        tool: toolName,
        success: true,
        result: res.data,
      };
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message
        : String(err);
      return { tool: toolName, success: false, error: msg };
    }
  }

  getTools(): MCPTool[] {
    return [...this.tools.values()];
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  isConnected(): boolean {
    return this.connected;
  }

  disconnect(): void {
    this.connected = false;
    this.tools.clear();
    console.log('[MCP] Disconnected');
  }
}
