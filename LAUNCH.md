# Operaxon OS — Launch v1.0.0
**April 1, 2026**

> An AI operating system that runs your business 24/7 for $0-500/mo, replacing 3 contractors and scaling infinitely.

---

## What is Operaxon?

Operaxon is a complete autonomous operating system for your business.

**One agent that:**
- Runs 24/7 on cloud or your machine
- Connects to every tool you use (GitHub, Linear, Slack, email, calendar, Discord)
- Thinks, decides, and executes without you
- Learns from every decision via memory
- Deploys anywhere: $5 VPS, serverless ($0/month idle), your laptop

---

## The 5 Phases

### ✅ Phase 1: Core Architecture
- Agent loop, tool system, cron scheduler, memory

### ✅ Phase 2: MERIDIAN + GOVERNOR
- Persistent memory engine (scales to 100K+ sessions)
- Policy enforcement + identity layer

### ✅ Phase 3: Deployment Pipeline
- Multi-tenant onboarding
- Stripe billing integration
- Customer dashboard
- Deploy to Fly.io, Railway, Heroku in one click

### ✅ Phase 4: ClawCode Integration
- Safe, audited code execution
- Tool allowlisting for security
- Model-aware token limits
- Reversible execution (undo support)

### ✅ Phase 5: Scalability
- **5A: Session Search** — Find anything in 100ms across 100K+ sessions
- **5B: MCP Integration** — Connect ANY external tool (GitHub, Linear, Notion, Slack)
- **5C: Cloud Backends** — Deploy to Modal ($0/month idle), Docker, SSH, Kubernetes
- **5D: Slash Commands** — Unified CLI + Telegram + Discord interface

---

## Real Problems Solved

### 1. The Time Multiplication Problem
You have 24 hours. Your business needs 168 hours/week.

**Solution:** Agent handles email triage, content posting, CRM updates, customer support, deal tracking — all while you sleep.

### 2. The Context Problem
You can't remember 500 conversations.

**Solution:** Search across 100K sessions in 100ms. "Did we discuss pricing with Acme Corp?" → instant answer from 2 years of history.

### 3. The Execution Gap
You decide. Someone implements. Communication breaks.

**Solution:** One agent. No handoffs. Decision → execution → report back. All audited.

### 4. The Tool Fragmentation Problem
Your stack: GitHub, Linear, Slack, Airtable, Stripe, Discord.

**Solution:** MCP (Model Context Protocol) connects ANY tool with zero code. Add a new SaaS? Write an MCP server, plug it in. Done.

### 5. The Cost Problem
Hiring 3 FTE contractors = $15K/mo.

**Solution:** $0-500/mo. Scales infinitely. No scaling cost.

---

## Quick Start

### Installation

```bash
git clone https://github.com/officialbrandonsandoval-source/operaxon-os
cd operaxon-os
pnpm install
pnpm build
```

### Run

```bash
# Start the gateway
pnpm operaxon start

# In another terminal, use CLI
operaxon search "find mentions of Ethan"
operaxon execute "print('hello world')"
operaxon build "Create a REST API"
operaxon help
```

### Deploy

```bash
# Modal (serverless, $0/month idle)
npm run deploy:modal

# Docker
docker-compose up

# Kubernetes
kubectl apply -f operaxon.yaml

# Fly.io
fly deploy
```

---

## CLI Commands (Phase 5D)

### /search
Search across all sessions (FTS5 + vector).

```bash
operaxon search "find mentions of Ethan"
operaxon search "trading signals" --mode hybrid --top-k 5
operaxon search "customer feedback" --agent legatus
```

### /execute
Execute code safely via ClawCode.

```bash
operaxon execute "print('hello world')"
operaxon execute "import os; print(os.getcwd())" --model sonnet --tools run_command
```

### /build
Build a new feature or component.

```bash
operaxon build "Create a REST API for user management"
operaxon build "Build a React component for data table" --model opus
```

### /audit
Audit code for security + quality.

```bash
operaxon audit "const x = eval(userInput)"
operaxon audit "packages/runtime/src/index.ts" --strict
```

### /help
Show available commands.

```bash
operaxon help
operaxon help search
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Agent Civilization                                          │
│  (Dominus + specialized agents for different functions)      │
└──────────────────────────────────────────────────────────────┘
                           ▲
                           │ Commands
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Operaxon Gateway (Express + WebSocket)                      │
│  ├── Multi-channel support (Telegram, Discord, HTTP)         │
│  ├── Session management                                      │
│  ├── Cron scheduler                                          │
│  └── Tool system                                             │
└──────────────────────────────────────────────────────────────┘
                           ▲
                ┌──────────┼──────────┬──────────┬──────────┐
                ▼          ▼          ▼          ▼          ▼
        ┌─────────┐  ┌──────────┐ ┌──────┐ ┌──────────┐ ┌───┐
        │MERIDIAN │  │GOVERNOR  │ │Claw  │ │Hermes    │ │MCP│
        │(Memory) │  │(Policy)  │ │Code  │ │(Search)  │ │   │
        │         │  │(Identity)│ │(4)   │ │(5A)      │ │(5B)
        └─────────┘  └──────────┘ └──────┘ └──────────┘ └───┘
```

---

## API

### Health Check
```
GET /health
```

### Send Message
```
POST /agent/message
Content-Type: application/json

{
  "content": "Build me a REST API",
  "sessionId": "optional",
  "channel": "http"
}
```

### WebSocket
```javascript
const ws = new WebSocket('ws://localhost:3000');
ws.send(JSON.stringify({ type: 'message', content: 'Hello agent' }));
```

---

## Pricing

### Solo
- **Setup:** $997
- **Monthly:** $997
- Perfect for: Freelancers, small businesses

### Business
- **Setup:** $1,997
- **Monthly:** $1,997
- Perfect for: Small teams, growing businesses

### Enterprise
- **Setup:** Custom ($2.5K - $5K)
- **Monthly:** Custom
- Perfect for: Large organizations, complex workflows

---

## Competitive Advantages

### vs. OpenClaw
- Session search (100K conversations)
- MCP (extensible to ANY tool)
- Cloud backends ($0/month idle cost)
- Built for business ops, not just coding

### vs. Hermes
- Autonomous execution (not interactive)
- Financial/sales ops focus
- Full orchestration layer (multi-agent)

### vs. Zapier
- Thinks and decides (not just if/then)
- Edge cases handled
- Custom logic supported

### vs. Hiring a VA
- Never quits, never forgets
- 10x cheaper
- Scales infinitely

---

## Getting Help

- **GitHub:** https://github.com/officialbrandonsandoval-source/operaxon-os
- **Docs:** https://operaxon.com/docs
- **Email:** team@operaxon.com
- **Discord:** https://discord.gg/operaxon

---

## The Pitch

**"An AI operating system that runs your business 24/7 for $0-500/mo, replacing 3 contractors and scaling infinitely."**

Built in public. April 1, 2026.

Shipped with everything: core runtime, memory, policy, code execution, search, integration, cloud deployment, CLI.

**Ship now. Improve forever.**
