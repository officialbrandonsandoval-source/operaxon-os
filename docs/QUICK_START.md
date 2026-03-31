# Quick Start — Operaxon OS

Get an AI agent running in under 5 minutes.

## Prerequisites

- Node.js 18+
- npm 9+
- Git

## Step 1: Clone

```bash
git clone https://github.com/officialbrandonsandoval-source/operaxon-os
cd operaxon-os
```

## Step 2: Install

```bash
npm install
```

## Step 3: Configure

```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=3000
AGENT_NAME=my-first-agent
ANTHROPIC_API_KEY=sk-ant-...  # optional for core runtime
```

## Step 4: Start

```bash
npm run dev
```

You'll see:
```
  ┌─────────────────────────────────┐
  │        Operaxon OS v0.1.0       │
  │   The Agentic Business OS       │
  └─────────────────────────────────┘

🚀 Operaxon OS Gateway running on port 3000
   HTTP: http://localhost:3000
   WS:   ws://localhost:3000
   Health: http://localhost:3000/health
```

## Step 5: Test It

### Health check
```bash
curl http://localhost:3000/health
```

### Send a message to your agent
```bash
curl -X POST http://localhost:3000/agent/message \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello agent", "channel": "http"}'
```

### Connect via WebSocket
```javascript
const ws = new WebSocket('ws://localhost:3000');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

---

## Build Your First Agent

Create `my-agent.ts`:

```typescript
import { createGateway } from './packages/runtime';
import BuilderAgent from './agents/templates/builder';

async function main() {
  const gateway = createGateway();
  const agent = new BuilderAgent({
    name: 'my-builder',
    workingDir: './workspace',
  });

  // Handle incoming messages
  // (wire up to channels or POST /agent/message)
  
  await gateway.listen(3000);
  console.log('Agent ready!');
}

main();
```

Run it:
```bash
ts-node my-agent.ts
```

---

## Use a Template Agent

| Template | Best For |
|----------|----------|
| `builder.ts` | Code generation, file creation, technical tasks |
| `researcher.ts` | Web research, summarization, analysis |
| `communicator.ts` | Outbound messaging, notifications, broadcasting |
| `sales.ts` | Pipeline management, outreach, deal tracking |

---

## Add a Telegram Channel

1. Get your bot token from [@BotFather](https://t.me/BotFather)
2. Add to `.env`: `TELEGRAM_BOT_TOKEN=your-token-here`
3. Implement the `TelegramChannel` stub in `packages/runtime/channels/manager.ts`
4. Restart: `npm run dev`

---

## Docker

```bash
# Build image
docker build -t operaxon-os .

# Run
docker run -p 3000:3000 --env-file .env operaxon-os

# Compose
docker-compose up -d
```

---

## Deploy to Production

### Recommended: Fly.io

1. Install [Fly CLI](https://fly.io/docs/getting-started/installing-flyctl/)
2. Authenticate: `flyctl auth login`
3. Launch: `flyctl launch` (follow prompts, uses `fly.toml` from repo)
4. Deploy: `flyctl deploy`
5. Check status: `flyctl status`

**Why Fly.io:** Fast cold starts, global edge deployment, excellent reliability.

---

### Alternative: Railway

**⚠️ Security Note:** Railway had a CDN caching incident (March 30, 2026) and has addressed it. Safe to use with proper token hygiene.

**Before deploying:**
1. Rotate your Railway API tokens (revoke old, generate new)
2. Use environment variables for all secrets (`.env` never committed)
3. Enable Railway's IP allowlisting if available

**Deploy:**
1. Push repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add environment variables from `.env.example`
4. Railway auto-deploys on push

---

### Other Options

- **Heroku**: Standard Node.js support, `Procfile` ready
- **Docker Registry**: Build and push to ECR, GCR, or DockerHub
- **Self-hosted**: Docker Compose on any VPS (Ubuntu/Debian)

---

## What's Next?

- [Architecture](./ARCHITECTURE.md) — how it all fits together
- [Governance](./GOVERNANCE.md) — open-core model explained
- Add MCP tools: connect `MCPClient` to your tools server
- Extend a template: add LLM calls to `processMessage()`
- Schedule jobs: `scheduler.register('my-job', 'Daily Report', '0 9 * * *', handler)`
