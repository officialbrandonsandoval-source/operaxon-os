# Operaxon OS

**The open-core operating system for agentic businesses.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./packages/runtime/LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/docker-ready-blue)](./Dockerfile)

> The window is now. AI agents are eating software. Operaxon OS is the runtime that runs them.

---

## What is Operaxon OS?

Operaxon OS is an **open-core runtime** for building, deploying, and governing AI agents at scale.

- **Open runtime** (`packages/runtime`) — MIT licensed. Build on it. Ship with it.
- **Proprietary intelligence layer** (Governor, Meridian, Sentinel, Coordinator) — The governance, memory, security, and multi-agent coordination stack.

Think: Linux is free. Red Hat Enterprise Linux is the business. Operaxon Runtime is free. Operaxon Enterprise is the platform.

---

## Quick Start

```bash
# Clone
git clone https://github.com/officialbrandonsandoval-source/operaxon-os
cd operaxon-os

# Install
npm install

# Configure
cp .env.example .env
# Edit .env with your API keys

# Start
npm run dev
```

Gateway running at:
- HTTP: `http://localhost:3000`
- WebSocket: `ws://localhost:3000`
- Health: `http://localhost:3000/health`

---

## CLI

```bash
# Initialize a new agent project
npx operaxon init my-agent

# Start the gateway
npx operaxon start

# Check status
npx operaxon status
```

---

## Architecture

```
operaxon-os/
├── packages/
│   ├── runtime/              # MIT — the open core
│   │   ├── gateway/          # HTTP/WebSocket server (Express + ws)
│   │   ├── channels/         # Telegram, Discord, HTTP adapters
│   │   ├── sessions/         # In-memory session management
│   │   ├── cron/             # node-cron scheduler
│   │   └── mcp/              # Model Context Protocol client
│   ├── governor/             # PROPRIETARY — policy enforcement
│   ├── meridian/             # PROPRIETARY — persistent memory
│   ├── sentinel/             # PROPRIETARY — security layer
│   └── coordinator/          # PROPRIETARY — multi-agent orchestration
├── agents/
│   └── templates/            # Ready-to-use agent templates
│       ├── builder.ts        # Code generation / construction
│       ├── researcher.ts     # Research and synthesis
│       ├── communicator.ts   # Multi-channel messaging
│       └── sales.ts          # Pipeline and outreach
├── cli/
│   ├── init.ts               # `operaxon init`
│   ├── start.ts              # `operaxon start`
│   └── status.ts             # `operaxon status`
└── docs/
    ├── ARCHITECTURE.md
    ├── QUICK_START.md
    └── GOVERNANCE.md
```

---

## Docker

```bash
# Build
docker build -t operaxon-os .

# Run
docker run -p 3000:3000 --env-file .env operaxon-os

# Or with docker-compose
docker-compose up
```

---

## Deployment

### Railway
Push to GitHub → connect repo on Railway → auto-deploys on push.

### Heroku
```bash
heroku create my-operaxon-agent
git push heroku main
```

### Fly.io
```bash
fly launch --name my-operaxon-agent
fly deploy
```

---

## API

### Health Check
```
GET /health
```
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "uptime": 142,
  "timestamp": "2026-03-31T21:37:00.000Z",
  "services": { "gateway": "up", "websocket": "up" }
}
```

### Send Message to Agent
```
POST /agent/message
Content-Type: application/json

{
  "content": "Build me a REST API",
  "sessionId": "optional-session-id",
  "channel": "http"
}
```

### WebSocket
```javascript
const ws = new WebSocket('ws://localhost:3000');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
ws.send(JSON.stringify({ type: 'message', content: 'Hello agent' }));
```

---

## Agent Templates

Pick a template and extend it:

```typescript
import { BuilderAgent } from 'operaxon-os/agents/templates/builder';
import { createGateway } from 'operaxon-os';

const gateway = createGateway();
const agent = new BuilderAgent({ name: 'my-builder' });

await gateway.listen(3000);
```

Templates: `builder`, `researcher`, `communicator`, `sales`

---

## License

- `packages/runtime/` — [MIT](./packages/runtime/LICENSE)
- `packages/governor/`, `packages/meridian/`, `packages/sentinel/`, `packages/coordinator/` — Proprietary. All rights reserved. Contact team@operaxon.com.

---

## Links

- **Website:** [operaxon.com](https://operaxon.com)
- **Docs:** [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- **Enterprise:** team@operaxon.com

---

Built in public. March 31, 2026.
