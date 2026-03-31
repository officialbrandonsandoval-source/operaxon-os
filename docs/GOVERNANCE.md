# Governance — Operaxon OS Open-Core Model

## The Model

Operaxon OS is **open-core**. Not open-washing. Not "open source with asterisks."

**Open Source (MIT):** The runtime — `packages/runtime`
**Proprietary:** The intelligence layer — Governor, Meridian, Sentinel, Coordinator

This is the same model as:
- MySQL (open) / MySQL Enterprise (closed)
- Linux (open) / Red Hat Enterprise (closed)
- Elasticsearch (open) / Elastic Cloud (closed)

## Why Open Core?

The runtime has no moat. Anyone could build it. We open-sourced it so you don't have to.

The intelligence layer is where the real value is. Four years of architecture decisions, security research, and production lessons baked in. That's the business.

## What's Free Forever

```
packages/runtime/
├── gateway/          # HTTP/WS server
├── channels/         # Channel adapters
├── sessions/         # Session management
├── cron/             # Scheduler
└── mcp/              # MCP client

agents/templates/     # All agent templates
cli/                  # init, start, status
docs/                 # All documentation
```

**License:** MIT. Use it. Fork it. Build on it. Ship with it.

## What's Proprietary

| Package | What It Does | Why It's Closed |
|---------|-------------|-----------------|
| Governor | Policy enforcement, principal hierarchy, approval workflows | Core governance IP |
| Meridian | Persistent memory, semantic search, cross-agent memory | Data architecture IP |
| Sentinel | Security monitoring, threat detection, PII protection | Security research IP |
| Coordinator | Multi-agent orchestration, dependency resolution | Runtime architecture IP |

## Licensing

| Tier | Runtime | Intelligence Layer | Price |
|------|---------|-------------------|-------|
| Community | ✅ MIT | ❌ | Free |
| Pro | ✅ MIT | Governor + Meridian | Contact us |
| Enterprise | ✅ MIT | All four packages | Contact us |

**Contact:** team@operaxon.com

## Contribution Policy

### Runtime (`packages/runtime`)
Open contributions welcome. Standard open-source flow:
1. Fork
2. Branch
3. PR with tests
4. Review and merge

### Proprietary Packages
Closed to external contributions. If you find a security issue in any package, email security@operaxon.com.

## Philosophy

The agentic business economy needs a shared runtime, the same way the web needed HTTP and TCP/IP. We're open-sourcing the runtime because a rising tide raises all ships.

The governance, memory, and security layers are where Operaxon builds its business. That's the fair exchange.

---

*Questions? team@operaxon.com*
