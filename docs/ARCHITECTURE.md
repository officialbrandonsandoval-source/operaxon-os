# Operaxon OS — Architecture

## Overview

Operaxon OS is an open-core platform for agentic businesses. It provides the runtime infrastructure that AI agents need to operate: communication channels, session persistence, scheduling, and tool integration.

```
┌─────────────────────────────────────────────────────┐
│                   Operaxon OS                       │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │            PROPRIETARY LAYER                 │   │
│  │  Governor │ Meridian │ Sentinel │ Coordinator│   │
│  └──────────────────────────────────────────────┘   │
│                       │                             │
│  ┌──────────────────────────────────────────────┐   │
│  │            OPEN RUNTIME (MIT)                │   │
│  │                                              │   │
│  │  ┌─────────┐  ┌──────────┐  ┌───────────┐  │   │
│  │  │ Gateway │  │ Channels │  │ Sessions  │  │   │
│  │  │ HTTP/WS │  │ TG/DC/SG │  │ Manager   │  │   │
│  │  └─────────┘  └──────────┘  └───────────┘  │   │
│  │                                              │   │
│  │  ┌─────────┐  ┌──────────┐                  │   │
│  │  │  Cron   │  │   MCP    │                  │   │
│  │  │Scheduler│  │  Client  │                  │   │
│  │  └─────────┘  └──────────┘                  │   │
│  └──────────────────────────────────────────────┘   │
│                       │                             │
│  ┌──────────────────────────────────────────────┐   │
│  │            AGENT TEMPLATES                   │   │
│  │  Builder │ Researcher │ Communicator │ Sales  │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Core Components

### Gateway (`packages/runtime/gateway`)
The HTTP and WebSocket server. All external traffic enters here.

- **Express** for REST endpoints
- **ws** for WebSocket connections
- Built-in health check at `/health`
- CORS enabled by default
- Request logging

### Channels (`packages/runtime/channels`)
Adapters for external messaging platforms.

| Channel | Status | Library |
|---------|--------|---------|
| HTTP | ✅ Included | Built-in |
| Telegram | 🔧 Stub | node-telegram-bot-api or grammy |
| Discord | 🔧 Stub | discord.js |
| Signal | 📋 Planned | signal-cli |
| Slack | 📋 Planned | @slack/bolt |

Implement a channel by extending the `Channel` interface and registering it with `ChannelManager`.

### Sessions (`packages/runtime/sessions`)
In-memory session management with TTL-based expiration.

- Sessions keyed by UUID
- Message history per session
- Automatic cleanup of expired sessions
- Statistics reporting

For production, replace the in-memory store with Redis or a database.

### Cron (`packages/runtime/cron`)
Scheduled task execution using `node-cron`.

- Standard cron expressions
- Named jobs
- Pause/resume/remove at runtime
- Error capture per job

### MCP (`packages/runtime/mcp`)
Model Context Protocol client for tool discovery and invocation.

- Connect to any MCP server
- Discover available tools
- Call tools with typed parameters
- Graceful handling when MCP is unavailable

## Proprietary Components

### Governor
Policy enforcement engine. Defines what agents can do, when, and with what approval requirements. Enforces the principal hierarchy.

### Meridian
Persistent memory layer. Gives agents durable, queryable memory across sessions. Includes semantic search, episodic memory, and cross-agent memory sharing.

### Sentinel
Security and threat detection. Monitors for prompt injection, jailbreaks, PII leaks, and behavioral anomalies.

### Coordinator
Multi-agent orchestration. Enables agents to spawn sub-agents, delegate tasks, and communicate with each other.

## Data Flow

```
External → Channel → Gateway → SessionManager → Agent Logic → Response
                                    ↓
                              Message History
                                    ↓
                             Cron / MCP / Channels
```

## Deployment Model

```
Local: ts-node cli/start.ts
Docker: docker run -p 3000:3000 operaxon-os
Cloud: Push to Railway/Heroku/Fly.io → auto-deploy
```

## Extension Points

1. **Add a channel**: Implement `Channel` interface → register in `ChannelManager`
2. **Add an agent**: Extend an agent template → wire up to message handler
3. **Add a cron job**: `scheduler.register(id, name, expression, handler)`
4. **Add an MCP tool**: Connect `MCPClient` to your MCP server → call tools in agent logic
5. **Swap session store**: Replace `Map<string, AgentSession>` with Redis or Postgres

## Security Notes

- Never commit `.env` (it's in `.gitignore`)
- Rotate `SESSION_SECRET` in production
- Rate-limit `/agent/message` before public deployment
- The proprietary Sentinel package provides deeper security for enterprise deployments
