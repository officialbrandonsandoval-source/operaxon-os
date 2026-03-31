// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

/**
 * onboarding-pipeline.ts — End-to-end orchestration
 *
 * Ties together:
 *   CustomerStore → StatusTracker → Questionnaire Validation → Provisioner
 *   → TenantManager → Deployer → HealthChecker → WebhookDispatcher
 *   → DashboardAuth registration
 *
 * This is the "onboard" button. Call it with a questionnaire response
 * and it handles everything through go-live.
 */

import { CustomerStore, CustomerStatus } from './customer.js';
import { QuestionnaireResponse, validateQuestionnaire } from './questionnaire.js';
import { Provisioner } from './provisioner.js';
import { StatusTracker } from './status.js';

// ─── Pipeline result ──────────────────────────────────────────────────────────

export interface PipelineResult {
  success: boolean;
  customerId: string;
  tenantId: string;
  stage: string;
  instanceUrl?: string;
  apiKey?: string;
  adminPassword?: string;
  durationMs: number;
  logs: string[];
  error?: string;
}

// ─── Pipeline options ─────────────────────────────────────────────────────────

export interface PipelineOptions {
  customerStore: CustomerStore;
  statusTracker: StatusTracker;
  provisioner: Provisioner;
  deploymentsDir: string;
}

// ─── OnboardingPipeline ───────────────────────────────────────────────────────

export class OnboardingPipeline {
  private opts: PipelineOptions;

  constructor(opts: PipelineOptions) {
    this.opts = opts;
  }

  async run(questionnaire: QuestionnaireResponse): Promise<PipelineResult> {
    const startTime = Date.now();
    const logs: string[] = [];
    const log = (msg: string) => {
      logs.push(`[${new Date().toISOString()}] ${msg}`);
      console.log(`[Pipeline] ${msg}`);
    };

    try {
      // ── Step 1: Validate questionnaire ─────────────────────────────────────
      log('Step 1/5: Validating questionnaire...');
      const validation = validateQuestionnaire(questionnaire);
      if (!validation.valid) {
        throw new Error(`Questionnaire validation failed: ${validation.errors.join('; ')}`);
      }
      if (validation.warnings.length > 0) {
        log(`Warnings: ${validation.warnings.join('; ')}`);
      }
      log('✓ Questionnaire valid');

      // ── Step 2: Create customer record ─────────────────────────────────────
      log('Step 2/5: Creating customer record...');
      const customer = this.opts.customerStore.create({
        name: questionnaire.principalName,
        email: questionnaire.principalEmail,
        company: questionnaire.businessName,
        tier: questionnaire.selectedTier,
        status: 'questionnaire',
        billingEmail: questionnaire.principalEmail,
        setupFeePaid: false,
        monthlyFeePaid: false,
        notes: questionnaire.specialRequirements,
        tags: [questionnaire.industry, questionnaire.deploymentTarget],
      });

      // Update questionnaire's customerId to real customer ID
      questionnaire.customerId = customer.id;

      // Create onboarding status
      const status = this.opts.statusTracker.create(customer.id, customer.tenantId);
      log(`✓ Customer created: ${customer.id}, tenant: ${customer.tenantId}`);

      // ── Step 3: Provision config ────────────────────────────────────────────
      log('Step 3/5: Provisioning configuration...');
      this.opts.statusTracker.advance(customer.id, 'provisioning', 'Generating tenant configuration');
      this.opts.customerStore.updateStatus(customer.id, 'provisioning');

      const provisionedConfig = this.opts.provisioner.provision(questionnaire, customer.tenantId);
      log(`✓ Config provisioned at ${provisionedConfig.outputDir}`);
      log(`  API key: ${provisionedConfig.apiKey.slice(0, 20)}...`);

      // Update customer with API key
      this.opts.customerStore.update(customer.id, {
        apiKey: provisionedConfig.apiKey,
        instancePort: provisionedConfig.instancePort,
      });

      // ── Step 4: Ready for deployment ────────────────────────────────────────
      log('Step 4/5: Deployment ready...');
      this.opts.statusTracker.advance(customer.id, 'deploying', 'Configuration ready — deployment can begin');
      this.opts.customerStore.updateStatus(customer.id, 'deploying');

      // Note: actual deployment is done by Deployer (deployment package)
      // Pipeline returns here with all config ready.
      // Deployer.deploy(provisionedConfig) is called from the CLI / cron job.
      log(`✓ Config ready. Run: deployer.deploy(config) to go live`);

      // ── Step 5: Return result ───────────────────────────────────────────────
      log('Step 5/5: Pipeline complete');

      return {
        success: true,
        customerId: customer.id,
        tenantId: customer.tenantId,
        stage: 'deploying',
        apiKey: provisionedConfig.apiKey,
        adminPassword: provisionedConfig.adminPassword,
        durationMs: Date.now() - startTime,
        logs,
      };

    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log(`Pipeline failed: ${error}`);

      return {
        success: false,
        customerId: questionnaire.customerId || 'unknown',
        tenantId: 'unknown',
        stage: 'failed',
        durationMs: Date.now() - startTime,
        logs,
        error,
      };
    }
  }
}
