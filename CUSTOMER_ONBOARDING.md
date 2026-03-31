# Customer Onboarding Guide
**Operaxon OS — Phase 3**

How a customer goes from inquiry to live in under 10 minutes.

---

## Overview

The onboarding pipeline has 5 stages. Progress is tracked in real-time.

| Stage | Progress | What Happens |
|---|---|---|
| Inquiry | 0% | Customer submits interest |
| Questionnaire | 25% | 5-10 min survey completed |
| Provisioning | 50% | Config auto-generated |
| Deploying | 75% | Instance spinning up |
| Live | 100% | Agents ready |

---

## Step 1: Customer Fills Questionnaire

The questionnaire captures everything we need. Takes 5-10 minutes.

**Key questions:**
- Business name, industry, team size
- Which tier: Solo ($997/mo), Business ($1,997/mo), Enterprise (custom)
- How many agents? Which types? (Governing, Builder, Research, Sales, etc.)
- Which channels? (Telegram, Discord, Slack, Webhook)
- Which integrations? (GitHub, Notion, HubSpot, Stripe, etc.)
- Who controls the agents? (Principal name + contact)
- Deployment target: Fly.io (recommended), Railway, or self-hosted

**What they provide:**
- Agent names and roles
- Channel credentials (bot tokens, API keys) — entered securely
- Billing email

---

## Step 2: Provisioner Auto-Generates Config

The `Provisioner` reads the questionnaire and generates:

```
deployments/
  {tenantId}/
    .env                    ← Runtime secrets (PORT, API_KEY, TIER, etc.)
    operaxon.config.json    ← Full Operaxon config (agents, channels, runtime)
    agents/
      {agent-name}.json     ← Per-agent config
    deploy-manifest.json    ← Docker/Fly.io deployment spec
```

**Config is fully validated before deployment.**

---

## Step 3: Deployment

From config to live in ~5 minutes:

```bash
# Fly.io (recommended)
cd deployments/{tenantId}
flyctl deploy

# Docker Compose (self-hosted)
cd deployments/{tenantId}
docker-compose up -d
```

The `Deployer` handles this automatically when triggered from the pipeline.

---

## Step 4: Health Check

After deployment, the health checker polls `/health` every 30 seconds.

```json
GET https://{instance-url}/health
→ { "status": "ok", "timestamp": "...", "agents": 3, "uptime": 42 }
```

Instance goes from `deploying` → `running` when health check passes.

---

## Step 5: Customer Gets Credentials

A webhook fires with:
- Instance URL: `https://operaxon-{tenant}.fly.dev`
- API key: `ox_live_...`
- Dashboard URL: `{instance-url}/dashboard`
- Next steps guide

---

## Rollback

If deployment fails, the system automatically:
1. Triggers rollback (Fly.io: `flyctl releases rollback`, Docker: `docker-compose down`)
2. Marks tenant status as `rolled_back` or `failed`
3. Notifies internal team via webhook
4. Config snapshot preserved for re-deploy

---

## Sample Customer: Acme Corp

```json
{
  "businessName": "Acme Corp",
  "tier": "business",
  "agents": ["Atlas (Governing)", "Iris (Communications)", "Oracle (Research)"],
  "channels": ["Telegram", "Slack", "Webhook"],
  "deploymentTarget": "fly.io",
  "estimatedGoLive": "< 10 minutes after questionnaire"
}
```

---

## Pricing

| Tier | Setup | Monthly | Agents | Channels |
|---|---|---|---|---|
| Solo | $997 | $997/mo | 3 | 2 |
| Business | $1,997 | $1,997/mo | 6 | 5 |
| Enterprise | $5,000+ | $2,500+/mo | Unlimited | Unlimited |
