/**
 * Docker Container Backend — Phase 5C
 * 
 * Deploy Operaxon via Docker containers.
 * Works with: Docker Desktop, Docker Compose, Kubernetes, Docker Swarm
 */

export interface DockerDeploymentConfig {
  imageName: string;
  imageTag: string;
  containerName: string;
  port: number;
  memory: string; // "1gb", "2gb", etc.
  cpus: string; // "1", "2", etc.
  env: Record<string, string>;
}

export class DockerBackend {
  private config: DockerDeploymentConfig;

  constructor(config: DockerDeploymentConfig) {
    this.config = config;
  }

  /**
   * Generate Dockerfile
   */
  generateDockerfile(): string {
    return `
FROM node:20-alpine

WORKDIR /operaxon

# Install dependencies
RUN apk add --no-cache python3 py3-pip curl

# Copy package.json files
COPY packages/runtime/package.json ./packages/runtime/
COPY packages/claw/package.json ./packages/claw/
COPY packages/hermes/package.json ./packages/hermes/
COPY packages/cli/package.json ./packages/cli/
COPY package.json pnpm-workspace.yaml ./

# Install dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Build TypeScript
RUN pnpm build

# Copy source code
COPY . .

# Expose port
EXPOSE ${this.config.port}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \\
    CMD curl -f http://localhost:${this.config.port}/health || exit 1

# Start gateway
CMD ["node", "packages/cli/dist/start.js"]
`;
  }

  /**
   * Generate docker-compose.yml
   */
  generateDockerCompose(): string {
    const envVars = Object.entries(this.config.env)
      .map(([k, v]) => `      - ${k}=${v}`)
      .join('\n');

    return `
version: '3.8'

services:
  operaxon:
    image: ${this.config.imageName}:${this.config.imageTag}
    container_name: ${this.config.containerName}
    ports:
      - "${this.config.port}:${this.config.port}"
    environment:
${envVars}
    resources:
      limits:
        cpus: '${this.config.cpus}'
        memory: ${this.config.memory}
      reservations:
        cpus: '0.5'
        memory: 512m
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:${this.config.port}/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    restart: unless-stopped
    volumes:
      - ./data:/operaxon/data
      - ./logs:/operaxon/logs
    networks:
      - operaxon-net

  redis:
    image: redis:7-alpine
    container_name: operaxon-redis
    ports:
      - "6379:6379"
    networks:
      - operaxon-net
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    container_name: operaxon-postgres
    environment:
      - POSTGRES_DB=operaxon
      - POSTGRES_USER=operaxon
      - POSTGRES_PASSWORD=changeme
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - operaxon-net
    restart: unless-stopped

volumes:
  postgres-data:

networks:
  operaxon-net:
    driver: bridge
`;
  }

  /**
   * Generate Kubernetes manifest
   */
  generateKubernetesManifest(): string {
    return `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: operaxon
  labels:
    app: operaxon
spec:
  replicas: 3
  selector:
    matchLabels:
      app: operaxon
  template:
    metadata:
      labels:
        app: operaxon
    spec:
      containers:
      - name: operaxon
        image: ${this.config.imageName}:${this.config.imageTag}
        ports:
        - containerPort: ${this.config.port}
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "${this.config.memory}"
            cpu: "${this.config.cpus}"
        livenessProbe:
          httpGet:
            path: /health
            port: ${this.config.port}
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: ${this.config.port}
          initialDelaySeconds: 5
          periodSeconds: 5
        env:
${Object.entries(this.config.env)
  .map(
    ([k, v]) =>
      `        - name: ${k}
          value: "${v}"`
  )
  .join('\n')}

---
apiVersion: v1
kind: Service
metadata:
  name: operaxon-service
spec:
  selector:
    app: operaxon
  type: LoadBalancer
  ports:
    - protocol: TCP
      port: 80
      targetPort: ${this.config.port}
`;
  }

  /**
   * Generate deployment script
   */
  generateDeployScript(): string {
    return `
#!/bin/bash
set -e

echo "🐳 Building Docker image..."
docker build -t ${this.config.imageName}:${this.config.imageTag} .

echo "🚀 Starting Operaxon with Docker Compose..."
docker-compose up -d

echo "✅ Deployment complete!"
echo ""
echo "Check status:"
echo "  docker-compose ps"
echo ""
echo "View logs:"
echo "  docker-compose logs -f operaxon"
echo ""
echo "Test:"
echo "  curl http://localhost:${this.config.port}/health"
`;
  }
}

export const dockerBackend = (config: DockerDeploymentConfig) => new DockerBackend(config);
