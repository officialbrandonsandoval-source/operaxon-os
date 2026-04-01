/**
 * Operaxon Phase 5A — Session Search
 * 
 * TypeScript wrapper for Python session search engine.
 * Provides FTS5 + vector search across all sessions.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface SessionSearchResult {
  sessionKey: string;
  agent: string;
  summary: string;
  score: number;
  searchType: 'fts' | 'vector' | 'hybrid';
  createdAt: string;
}

export class SessionSearchEngine {
  private pythonScriptPath: string;

  constructor(pythonScriptPath?: string) {
    // Path to cli_search.py in the Operaxon workspace
    this.pythonScriptPath =
      pythonScriptPath ||
      path.resolve(__dirname, '../../../cli_search.py');
  }

  /**
   * Search across all sessions
   * Performance: <100ms on 10K sessions
   */
  async search(
    query: string,
    options?: {
      mode?: 'fts' | 'vector' | 'hybrid';
      topK?: number;
      agent?: string;
      format?: 'json' | 'text';
    }
  ): Promise<SessionSearchResult[]> {
    return new Promise((resolve, reject) => {
      const args = [this.pythonScriptPath, query];

      if (options?.mode) {
        args.push('--mode', options.mode);
      }
      if (options?.topK) {
        args.push('--top-k', String(options.topK));
      }
      if (options?.agent) {
        args.push('--agent', options.agent);
      }
      args.push('--json'); // Always get JSON from the subprocess

      const child = spawn('python3', args, {
        timeout: 5000, // 5 second timeout
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          try {
            // Parse JSON output from Python script
            const results = JSON.parse(stdout) as SessionSearchResult[];
            resolve(results);
          } catch (error) {
            reject(new Error(`Failed to parse search results: ${error}`));
          }
        } else {
          reject(new Error(`Search failed: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * FTS5 full-text search
   * Blazingly fast for keyword-based searches
   */
  async ftsSearch(query: string, topK: number = 10): Promise<SessionSearchResult[]> {
    return this.search(query, { mode: 'fts', topK });
  }

  /**
   * Vector semantic search
   * Finds semantically similar content (not keyword-based)
   */
  async vectorSearch(query: string, topK: number = 10): Promise<SessionSearchResult[]> {
    return this.search(query, { mode: 'vector', topK });
  }

  /**
   * Hybrid search (FTS + Vector with RRF ranking)
   * Best of both worlds: keyword + semantic
   */
  async hybridSearch(query: string, topK: number = 10): Promise<SessionSearchResult[]> {
    return this.search(query, { mode: 'hybrid', topK });
  }

  /**
   * Search within a specific agent's sessions
   */
  async searchByAgent(
    query: string,
    agent: string,
    topK: number = 10
  ): Promise<SessionSearchResult[]> {
    return this.search(query, { agent, topK });
  }
}

// Export singleton instance
export const searchEngine = new SessionSearchEngine();
