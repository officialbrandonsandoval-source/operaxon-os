# Operaxon OS — Docker Deployment

Production-grade Docker setup for Operaxon OS with multi-stage builds, non-root execution, and security hardening.

## Quick Start

```bash
cd docker

# Copy and configure environment
cp .env.example .env
# Edit .env with your API keys and settings

# Build and run
docker compose up -d
```

## Building the Image

Build from the project root:

```bash
docker build -f docker/Dockerfile -t operaxon-os .
```

Or from the docker directory:

```bash
docker compose build
```

The Dockerfile uses a multi-stage build:
- **Builder stage**: Installs dependencies, compiles TypeScript
- **Production stage**: Copies only built artifacts, runs as non-root user

## Running with Docker Compose

```bash
# Start in background
docker compose up -d

# Start with build
docker compose up -d --build

# Stop
docker compose down

# Stop and remove volumes (deletes all data)
docker compose down -v
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OPERAXON_PORT` | `3000` | Host port mapped to the container |
| `NODE_ENV` | `production` | Runtime environment |
| `OPERAXON_DATA_DIR` | `/data/operaxon` | Data directory inside the container |
| `OPERAXON_CONFIG_PATH` | `/app/config/operaxon.config.json` | Path to config file inside the container |
| `ANTHROPIC_API_KEY` | — | API key for Claude model access |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token (if using Telegram channel) |
| `DISCORD_BOT_TOKEN` | — | Discord bot token (if using Discord channel) |

API keys and tokens should be set in the `.env` file or passed via your deployment platform's secrets management. Never commit secrets to version control.

## Volume Mounts

| Mount | Container Path | Purpose |
|---|---|---|
| `operaxon-data` | `/data/operaxon` | Persistent storage for memory, audit logs, and runtime data |
| `./config` | `/app/config` (read-only) | Configuration files mounted as read-only |

The `operaxon-data` volume is a named Docker volume managed by the Docker engine. It persists across container restarts and rebuilds.

## Security Considerations

The deployment is hardened with multiple layers:

- **Non-root user**: The container runs as user `operaxon` (UID 1001), not root.
- **Read-only filesystem**: The root filesystem is mounted read-only. Only `/tmp` (tmpfs) and `/data/operaxon` (volume) are writable.
- **Dropped capabilities**: All Linux capabilities are dropped. Only `NET_BIND_SERVICE` is added back for port binding.
- **No privilege escalation**: The `no-new-privileges` security option prevents processes from gaining additional privileges.
- **Resource limits**: CPU and memory are capped to prevent resource exhaustion (2 CPUs, 2 GB RAM).
- **Health checks**: Built-in health check pings `/health` every 30 seconds.

## Viewing Logs

```bash
# Follow logs
docker compose logs -f

# Last 100 lines
docker compose logs --tail 100

# Logs since a timestamp
docker compose logs --since 2024-01-01T00:00:00
```

## Backing Up Data

Back up the named volume:

```bash
# Create a backup archive
docker run --rm \
  -v operaxon-data:/source:ro \
  -v $(pwd):/backup \
  alpine tar czf /backup/operaxon-backup-$(date +%Y%m%d).tar.gz -C /source .
```

Restore from backup:

```bash
# Restore from archive
docker run --rm \
  -v operaxon-data:/target \
  -v $(pwd):/backup:ro \
  alpine sh -c "rm -rf /target/* && tar xzf /backup/operaxon-backup-YYYYMMDD.tar.gz -C /target"
```

## Troubleshooting

**Container exits immediately**: Check logs with `docker compose logs`. Common causes include missing API keys or invalid configuration.

**Permission denied errors**: Ensure the data volume is owned by UID 1001. The Dockerfile creates the directory with correct ownership, but manually created bind mounts may need `chown 1001:1001`.

**Health check failing**: The container expects a `/health` endpoint on port 3000. Verify the application started correctly by checking logs.
