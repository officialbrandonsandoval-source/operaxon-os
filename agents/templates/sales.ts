/**
 * Sales Agent Template
 *
 * A sales intelligence agent that manages pipeline,
 * qualification, outreach, and deal tracking.
 */

import type { AgentMessage } from '../../packages/runtime/types';

export interface SalesAgentConfig {
  name: string;
  product: string;
  targetICP?: {
    industries?: string[];
    companySizeMin?: number;
    companySizeMax?: number;
    roles?: string[];
  };
  followUpDays?: number;
}

export interface Prospect {
  id: string;
  name: string;
  company: string;
  email?: string;
  stage: 'new' | 'qualified' | 'contacted' | 'demo' | 'proposal' | 'won' | 'lost';
  icpScore?: number;
  notes: string[];
  createdAt: Date;
  updatedAt: Date;
}

export class SalesAgent {
  private pipeline: Prospect[] = [];

  constructor(private config: SalesAgentConfig) {
    console.log(`[Sales] Agent "${config.name}" initialized for product: ${config.product}`);
  }

  async processMessage(message: AgentMessage): Promise<string> {
    const content = message.content.toLowerCase();

    if (content.includes('add prospect') || content.includes('new lead') ||
        content.includes('qualify')) {
      return this.handleProspect(message.content);
    }

    if (content.includes('pipeline') || content.includes('status')) {
      return this.getPipelineStatus();
    }

    if (content.includes('follow up') || content.includes('followup')) {
      return this.getFollowUps();
    }

    if (content.includes('help')) {
      return this.getHelp();
    }

    return `Sales agent "${this.config.name}" received: "${message.content}". Send "help" for available commands.`;
  }

  private async handleProspect(request: string): Promise<string> {
    const prospect: Prospect = {
      id: `prospect-${Date.now()}`,
      name: 'Unknown',
      company: 'Unknown',
      stage: 'new',
      notes: [request],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.pipeline.push(prospect);

    return [
      `✅ Prospect added: ${prospect.id}`,
      `Stage: ${prospect.stage}`,
      ``,
      `To activate: integrate with CRM (HubSpot, Salesforce, Airtable)`,
      `and LLM for ICP scoring and personalized outreach generation.`,
      ``,
      `Product: ${this.config.product}`,
    ].join('\n');
  }

  private getPipelineStatus(): string {
    const stages = ['new', 'qualified', 'contacted', 'demo', 'proposal', 'won', 'lost'];
    const counts: Record<string, number> = {};
    stages.forEach((s) => (counts[s] = 0));
    this.pipeline.forEach((p) => (counts[p.stage] = (counts[p.stage] || 0) + 1));

    return [
      `📊 Sales Pipeline — ${this.config.product}`,
      `Total prospects: ${this.pipeline.length}`,
      ``,
      ...stages.map((s) => `  ${s}: ${counts[s]}`),
      ``,
      `ICP: ${JSON.stringify(this.config.targetICP || {}, null, 2)}`,
    ].join('\n');
  }

  private getFollowUps(): string {
    const followUpDays = this.config.followUpDays || 3;
    const cutoff = new Date(Date.now() - followUpDays * 86400_000);

    const due = this.pipeline.filter(
      (p) => p.updatedAt < cutoff &&
             !['won', 'lost'].includes(p.stage)
    );

    if (due.length === 0) {
      return `✅ No follow-ups due (threshold: ${followUpDays} days)`;
    }

    return [
      `⏰ Follow-ups due (${due.length}):`,
      ...due.map((p) => `  • ${p.name} @ ${p.company} — ${p.stage}`),
    ].join('\n');
  }

  private getHelp(): string {
    return [
      `💼 Sales Agent — Available Commands`,
      ``,
      `add prospect/new lead <details> — Add a prospect`,
      `pipeline/status — View pipeline breakdown`,
      `follow up — Show prospects needing follow-up`,
      `help — Show this message`,
      ``,
      `Product: ${this.config.product}`,
    ].join('\n');
  }
}

export default SalesAgent;
