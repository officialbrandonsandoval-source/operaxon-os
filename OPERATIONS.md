# Operations Guide
**Operaxon OS — Phase 3**

How to manage customers post-launch.

---

## Daily Checklist

- [ ] Check all tenant health checks passing
- [ ] Review overnight error logs
- [ ] Check usage against plan limits (flag overage customers)
- [ ] Confirm billing cycle processing (1st of month)

---

## Customer Lifecycle

```
Inquiry → Questionnaire → Provisioning → Deploying → Live → [Suspended | Churned]
```

**Status commands (all via TenantManager):**

```typescript
// List all running tenants
tenantManager.list({ status: 'running' })

// Stats across all tenants
tenantManager.stats()
// → { total: 5, running: 4, deploying: 1, failed: 0, terminated: 0 }

// Suspend a tenant (billing failure, violation)
tenantManager.updateStatus(tenantId, 'stopped')

// Terminate (purge data only with explicit flag)
tenantManager.terminate(tenantId, false)  // status only
tenantManager.terminate(tenantId, true)   // purge all data (irreversible)
```

---

## Adding a Customer Mid-Month

No special handling needed. Billing starts from their live date.
First invoice includes setup fee + prorated monthly.

---

## Billing Operations

**Monthly invoice run (1st of month):**

```typescript
for (const tenant of tenantManager.list({ status: 'running' })) {
  const customer = customerStore.getByTenantId(tenant.id);
  const usage = usageTracker.getCurrent(tenant.id);
  const invoice = invoiceGenerator.generate({
    tenantId: tenant.id,
    customerId: customer.id,
    tier: customer.tier,
    usage,
    billingEmail: customer.billingEmail,
    isFirstMonth: false,
  });

  // Send to Stripe
  const stripeInvoice = await stripe.createInvoice({ stripeCustomerId: customer.stripeCustomerId, invoice });
  await stripe.finalizeAndSendInvoice(stripeInvoice.id);
  invoiceGenerator.markPaid(invoice.id, stripeInvoice.id);
}
```

**Failed payment:**
1. Invoice status → `failed`
2. Customer notified via webhook
3. After 3 failed attempts: tenant suspended
4. Tenant restored once payment clears

---

## Upgrading a Customer's Tier

```typescript
// Update customer record
customerStore.update(customerId, { tier: 'enterprise' });

// Re-provision with new tier limits
const newConfig = provisioner.provision(updatedQuestionnaire, tenantId);

// Redeploy (optional — tier change may not require restart)
await deployer.deploy(newConfig);
```

---

## Handling Support Requests

1. Customer reports issue → check dashboard `/audit` + `/agents`
2. Check logs: `data/{tenantId}/logs/`
3. If agent issue → check MERIDIAN memory (`/dashboard/memory`)
4. If infrastructure issue → check Fly.io dashboard for that app
5. If billing issue → check invoice status + Stripe dashboard

---

## Tenant Data Access (Internal Only)

Never access tenant data without customer permission. Only for:
- Technical support (with customer request)
- Security incident investigation
- Billing dispute resolution

All internal access is logged to `data/{tenantId}/audit/`.

---

## Scaling

**Current limit:** As many tenants as Fly.io can host (effectively unlimited).

**Database:** All data is currently flat-file JSON. Migration path:
- `CustomerStore` → PostgreSQL (when > 50 customers)
- `UsageTracker` → TimescaleDB (when usage data > 10GB)
- `MeridianStorage` → Vector DB (when memory search needs semantic)

---

## Go-Live Checklist

Before marking a customer as live:

- [ ] Questionnaire completed and validated
- [ ] Config provisioned (`.env`, `operaxon.config.json`, `deploy-manifest.json`)
- [ ] Tenant namespace created (no cross-contamination)
- [ ] Deployment successful (Fly.io or Docker)
- [ ] Health check passing (`/health` returns 200)
- [ ] API key registered in DashboardAuth
- [ ] Customer webhook fired (go-live notification sent)
- [ ] First invoice generated (dry-run or real)
- [ ] Customer onboarded to dashboard
- [ ] Internal team notified (#wins on Discord)

---

## Emergency Runbook

**Instance down:**
1. `flyctl status --app {instance-name}`
2. `flyctl logs --app {instance-name}`
3. If config issue: restore from snapshot + redeploy
4. Notify customer: "Your instance is experiencing issues, ETA restored: X min"

**Data concern (suspected leak):**
1. Run cross-contamination check on affected tenants
2. `tenantStorage.readAuditLog()` for access trail
3. Suspend tenant until investigation complete
4. Document incident + root cause in ops log

**Billing failure:**
1. Check Stripe dashboard for payment method issue
2. Notify customer: invoice failed, retry in 3 days
3. After 3 failures: suspend tenant (with 48h notice)
