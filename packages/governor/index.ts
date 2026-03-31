/**
 * @operaxon/governor — PROPRIETARY
 *
 * The Governor is the policy enforcement and decision layer of Operaxon OS.
 * It governs what agents can do, when, and with what constraints.
 *
 * Capabilities:
 * - Policy engine: define what actions are permitted per agent/context
 * - Rate limiting and budget enforcement
 * - Approval workflows for high-stakes actions
 * - Audit logging of all governed decisions
 * - Principal hierarchy enforcement (God → Owner → Agent)
 *
 * This package is proprietary and not included in the open-source runtime.
 * Contact team@operaxon.com for licensing.
 */

export class Governor {
  constructor() {
    throw new Error(
      'Governor is a proprietary Operaxon OS component. ' +
      'See https://operaxon.com/enterprise for access.'
    );
  }
}
