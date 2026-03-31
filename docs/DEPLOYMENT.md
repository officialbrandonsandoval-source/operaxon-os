# Deployment Guide — Operaxon OS

Complete guide to deploying Operaxon OS to production.

## Local Development

```bash
npm install
npm run dev
```

Runs on `http://localhost:3000`. Perfect for testing agents and integrations.

---

## Docker

### Build

```bash
docker build -t operaxon-os:latest .
```

### Run Locally

```bash
docker run -p 3000:3000 --env-file .env operaxon-os:latest
```

### Push to Registry

```bash
# ECR (AWS)
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com
docker tag operaxon-os:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/operaxon-os:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/operaxon-os:latest

# Docker Hub
docker tag operaxon-os:latest yourname/operaxon-os:latest
docker push yourname/operaxon-os:latest
```

---

## Fly.io (Recommended)

### Prerequisites

- [Fly CLI](https://fly.io/docs/getting-started/installing-flyctl/)
- Free Fly.io account

### Deploy

```bash
# First time: create app
flyctl launch

# Follow prompts:
# - App name: operaxon-os-prod (or your choice)
# - Region: choose closest to users
# - Use Dockerfile: yes

# Deploy
flyctl deploy
```

### Monitor

```bash
# Check status
flyctl status

# View logs
flyctl logs

# Scale instances
flyctl scale count=3

# Update environment variables
flyctl secrets set ANTHROPIC_API_KEY=sk-ant-...
```

### Cost

- **Starter**: 3 free shared CPU instances (750 hours/month)
- **Production**: $5/month per instance + egress

---

## Railway (Alternative)

**Security Status (March 2026):**
- ✅ CDN caching incident (March 30) resolved
- ⚠️ Attackers have used Railway infrastructure for phishing (not a Railway vulnerability)
- ✅ Safe if you rotate API tokens and use environment variables for all secrets

### Prerequisites

- GitHub account with repo push access
- Railway account

### Setup

1. Go to [railway.app](https://railway.app)
2. New Project → Deploy from GitHub
3. Select `operaxon-os` repo
4. Add environment variables:
   - `ANTHROPIC_API_KEY=sk-ant-...`
   - `PORT=3000`
5. Auto-deploys on every push to `main`

### Security Checklist

- [ ] Revoke old Railway API tokens
- [ ] Generate new tokens in Railway dashboard
- [ ] Never commit `.env` file
- [ ] Use Railway's `railway.json` for config (included in repo)
- [ ] Enable environment variable encryption if available

---

## Heroku

### Prerequisites

- Heroku CLI: `brew install heroku/brew/heroku`
- Heroku account

### Deploy

```bash
# Login
heroku login

# Create app
heroku create operaxon-os-prod

# Set environment
heroku config:set ANTHROPIC_API_KEY=sk-ant-...

# Deploy
git push heroku main

# View logs
heroku logs --tail
```

### Cost

Heroku stopped free tier, starting at $7/month.

---

## Kubernetes (Advanced)

### Helm Chart (coming soon)

For now, use standard Kubernetes manifests:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: operaxon-os
spec:
  replicas: 3
  selector:
    matchLabels:
      app: operaxon-os
  template:
    metadata:
      labels:
        app: operaxon-os
    spec:
      containers:
      - name: operaxon-os
        image: operaxon-os:latest
        ports:
        - containerPort: 3000
        env:
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: operaxon-secrets
              key: api-key
```

Apply:
```bash
kubectl apply -f operaxon-deployment.yaml
kubectl expose deployment operaxon-os --type=LoadBalancer --port=80 --target-port=3000
```

---

## Environment Variables

All deployments use the same `.env` format:

```env
# Runtime
PORT=3000
NODE_ENV=production

# LLM (optional for core runtime)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Channels
TELEGRAM_BOT_TOKEN=...
DISCORD_BOT_TOKEN=...

# Storage (optional)
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Observability
LOG_LEVEL=info
SENTRY_DSN=...
```

Never commit secrets. Use your deployment platform's secrets manager.

---

## Monitoring & Observability

### Health Endpoint

All deployments expose:
```bash
GET /health
```

Returns:
```json
{
  "status": "ok",
  "uptime": 3600,
  "agents": 2,
  "channels": ["telegram", "http"]
}
```

### Logs

- **Local**: `npm run dev` outputs to stdout
- **Docker**: `docker logs <container>`
- **Fly.io**: `flyctl logs`
- **Railway**: Dashboard → Logs tab
- **Heroku**: `heroku logs --tail`

### Metrics (Coming Soon)

Integration with Prometheus, DataDog, or New Relic via environment variables.

---

## Rollback

### Fly.io

```bash
flyctl releases
flyctl releases rollback
```

### Railway

GitHub integration: revert commit, Railway auto-redeploys.

### Heroku

```bash
heroku releases
heroku rollback v42
```

---

## What's Next?

- [Quick Start](./QUICK_START.md) — get running in 5 minutes
- [Architecture](./ARCHITECTURE.md) — how Operaxon OS works
- Production Readiness Checklist (coming soon)
