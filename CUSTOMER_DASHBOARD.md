# Customer Dashboard Guide
**Operaxon OS — Phase 3**

How customers monitor and manage their Operaxon OS instance.

---

## Authentication

All dashboard requests require your API key:

```bash
Authorization: Bearer ox_live_your_key_here
```

Your API key was provided in the go-live notification.
**Treat it like a password — don't share or commit it.**

---

## API Endpoints

Base URL: `https://{your-instance}.fly.dev`

| Endpoint | Method | Description |
|---|---|---|
| `/dashboard/health` | GET | API health (no auth required) |
| `/dashboard/agents` | GET | List all agents + status |
| `/dashboard/agents/:id` | GET | Agent detail |
| `/dashboard/memory` | GET | Memory overview + stats |
| `/dashboard/memory/search?q=` | GET | Search agent memory |
| `/dashboard/audit` | GET | Audit trail (today) |
| `/dashboard/audit?date=YYYY-MM-DD` | GET | Audit trail for a date |
| `/dashboard/usage` | GET | Usage metrics this period |
| `/dashboard/billing` | GET | Billing summary |
| `/dashboard/status` | GET | Instance status |

---

## Agents Panel

Shows all agents running in your instance:

```json
GET /dashboard/agents

{
  "tenantId": "tenant_abc123",
  "agents": [
    {
      "id": "agent_atlas",
      "name": "Atlas",
      "role": "Governing intelligence",
      "status": "idle",
      "model": "claude-sonnet-4-6",
      "tasksCompleted": 42,
      "avgResponseMs": 1230
    }
  ]
}
```

**Status values:** idle | active | consolidating | suspended | error

---

## Memory Browser

Your agents store learned context in MERIDIAN memory.

```json
GET /dashboard/memory/search?q=customer+support

{
  "results": [
    {
      "key": "lesson_2026_03_31",
      "snippet": "...customers prefer responses under 2 minutes for support tickets..."
    }
  ]
}
```

---

## Audit Log

Every agent action is logged with: who did what, when, and outcome.

```json
GET /dashboard/audit

{
  "entries": [
    {
      "timestamp": "2026-03-31T16:00:00Z",
      "actor": "Atlas",
      "action": "send_message",
      "resource": "telegram:channel",
      "outcome": "success"
    }
  ]
}
```

---

## Usage Metrics

Track API calls, messages, and consolidations against your plan limits.

```json
GET /dashboard/usage

{
  "currentPeriod": {
    "period": "2026-03",
    "apiCallsTotal": 4231,
    "messagesProcessed": 1847,
    "consolidationsRun": 3,
    "agentTasksCompleted": 892
  }
}
```

---

## UI (React Dashboard)

The React dashboard is available at `{instance-url}/dashboard`.

**Pages:**
- **Agents** — status, tasks, models, last active
- **Memory** — search, browse, stats
- **Audit Log** — browse by date, filter by outcome
- **Usage** — metrics vs plan limits
- **Billing** — current period, invoices
- **Settings** — channels, agent config, billing info
