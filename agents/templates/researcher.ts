/**
 * Researcher Agent Template
 *
 * A research agent that handles information gathering,
 * web search, analysis, and synthesis tasks.
 */

import type { AgentMessage } from '../../packages/runtime/types';

export interface ResearcherAgentConfig {
  name: string;
  maxSearchResults?: number;
  summaryLength?: 'brief' | 'detailed' | 'comprehensive';
}

export interface ResearchQuery {
  id: string;
  query: string;
  sources: string[];
  status: 'pending' | 'running' | 'complete' | 'failed';
  result?: string;
  createdAt: Date;
}

export class ResearcherAgent {
  private queries: ResearchQuery[] = [];

  constructor(private config: ResearcherAgentConfig) {
    console.log(`[Researcher] Agent "${config.name}" initialized`);
  }

  async processMessage(message: AgentMessage): Promise<string> {
    const content = message.content.toLowerCase();

    if (content.includes('research') || content.includes('find') ||
        content.includes('search') || content.includes('what is') ||
        content.includes('who is') || content.includes('explain')) {
      return this.handleResearchRequest(message.content);
    }

    if (content.includes('status') || content.includes('queries')) {
      return this.getStatus();
    }

    if (content.includes('help')) {
      return this.getHelp();
    }

    return `Researcher agent "${this.config.name}" received: "${message.content}". Send "help" for available commands.`;
  }

  private async handleResearchRequest(query: string): Promise<string> {
    const research: ResearchQuery = {
      id: `research-${Date.now()}`,
      query,
      sources: [],
      status: 'pending',
      createdAt: new Date(),
    };

    this.queries.push(research);

    return [
      `🔍 Research task queued: ${research.id}`,
      `📋 Query: ${query.substring(0, 100)}`,
      ``,
      `To activate: integrate with web search (Tavily, Serper, DuckDuckGo)`,
      `and connect to an LLM for synthesis and summarization.`,
      ``,
      `Summary style: ${this.config.summaryLength || 'detailed'}`,
    ].join('\n');
  }

  private getStatus(): string {
    return [
      `📊 Researcher Status`,
      `Agent: ${this.config.name}`,
      `Queries run: ${this.queries.length}`,
      `Max results: ${this.config.maxSearchResults || 10}`,
      `Summary style: ${this.config.summaryLength || 'detailed'}`,
    ].join('\n');
  }

  private getHelp(): string {
    return [
      `🔬 Researcher Agent — Available Commands`,
      ``,
      `research/find/search <topic> — Queue a research task`,
      `status — Show agent status`,
      `help — Show this message`,
      ``,
      `Examples:`,
      `  "Research the latest AI agent frameworks"`,
      `  "Find competitors to Operaxon OS"`,
      `  "Explain Model Context Protocol"`,
    ].join('\n');
  }
}

export default ResearcherAgent;
