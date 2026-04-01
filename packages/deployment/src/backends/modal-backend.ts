/**
 * Modal Serverless Backend — Phase 5C
 * 
 * Deploy Operaxon to Modal (serverless, $0/month idle cost)
 * https://modal.com
 * 
 * Modal is perfect for Operaxon:
 * - Auto-scales to 0 when idle (no cost)
 * - $0.20/GPU hour (powerful + cheap)
 * - Built for AI/ML workloads
 * - Python + Node.js support
 */

export interface ModalDeploymentConfig {
  appName: string;
  memory: number; // MB (256, 512, 1024, etc.)
  timeout: number; // seconds
  maxConcurrency: number;
  cpuCount: number;
  gpuType?: 'T4' | 'A40' | 'H100'; // Optional GPU
}

export class ModalBackend {
  private config: ModalDeploymentConfig;

  constructor(config: ModalDeploymentConfig) {
    this.config = config;
  }

  /**
   * Generate Modal app.py (Python entry point)
   */
  generateAppPy(): string {
    return `
import modal
import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

app = modal.App("${this.config.appName}")

@app.function(
    memory=${this.config.memory},
    timeout=${this.config.timeout},
    concurrency_limit=${this.config.maxConcurrency},
)
@modal.web_endpoint(method="POST")
def operaxon_handler(request: dict) -> dict:
    """
    Operaxon entrypoint on Modal.
    Receives agent message, executes, returns result.
    """
    try:
        message = request.get("message", "")
        sessionId = request.get("sessionId", "")
        
        # Import Operaxon runtime
        import sys
        sys.path.insert(0, "/operaxon")
        from runtime import execute_agent
        
        result = execute_agent(message, sessionId)
        
        return {
            "success": True,
            "data": result,
            "executedOn": "modal",
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "executedOn": "modal",
        }

if __name__ == "__main__":
    app.run()
`;
  }

  /**
   * Generate modal.toml config
   */
  generateConfig(): string {
    const gpu = this.config.gpuType
      ? `\\n    gpu: "${this.config.gpuType}"`
      : '';

    return `
[app]
name = "${this.config.appName}"
environment = "prod"

[function.operaxon_handler]
memory = ${this.config.memory}
timeout = ${this.config.timeout}
concurrency_limit = ${this.config.maxConcurrency}
cpu_count = ${this.config.cpuCount}${gpu}

[webhook]
path = "/operaxon"
method = "POST"

[billing]
# Modal bills for CPU time only when function executes
# Idle time = $0
# Active time = $0.20/GPU/hour (if GPU used)
auto_scale = true
min_replicas = 0
max_replicas = 10
`;
  }

  /**
   * Generate Dockerfile for Modal container
   */
  generateDockerfile(): string {
    return `
FROM python:3.11-slim

WORKDIR /operaxon

# Install dependencies
RUN apt-get update && apt-get install -y \\
    build-essential \\
    curl \\
    && rm -rf /var/lib/apt/lists/*

# Copy Operaxon code
COPY . .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install Modal
RUN pip install modal

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \\
    CMD curl -f http://localhost:8000/health || exit 1

# Modal will handle entrypoint
`;
  }

  /**
   * Generate deployment script
   */
  generateDeployScript(): string {
    return `
#!/bin/bash
set -e

echo "🚀 Deploying Operaxon to Modal..."

# 1. Install Modal CLI
npm install -g modal
modal auth

# 2. Create Modal app
echo "📦 Creating Modal app..."
modal app create ${this.config.appName}

# 3. Deploy
echo "🔼 Deploying to Modal..."
modal deploy app.py

# 4. Get URL
echo "✅ Deployment complete!"
echo ""
echo "Operaxon is now running on Modal:"
echo "  URL: https://<your-modal-url>/operaxon"
echo "  Status: Idle until first request"
echo "  Cost: $0/month when idle, $0.20/GPU hour when active"
echo ""
echo "Test it:"
echo "  curl -X POST https://<your-modal-url>/operaxon \\\\
    -d '{\"message\": \"Hello world\"}'"
`;
  }

  /**
   * Cost estimator
   */
  estimateCosts(monthlyRequests: number = 10000): {
    idle: number;
    active: number;
    average: number;
  } {
    // Assume 1 second execution per request
    const activeSeconds = monthlyRequests * 1; // 1 sec per request
    const activeHours = activeSeconds / 3600;

    // $0.20/GPU hour (if GPU used)
    const gpuCost = this.config.gpuType ? activeHours * 0.2 : 0;

    // CPU cost (typically included in GPU cost, or $0.05/CPU hour)
    const cpuCost = this.config.gpuType ? 0 : activeHours * this.config.cpuCount * 0.05;

    return {
      idle: 0, // $0/month when idle
      active: gpuCost + cpuCost,
      average: (gpuCost + cpuCost) / 30, // Per day
    };
  }
}

export const modalBackend = (config: ModalDeploymentConfig) => new ModalBackend(config);
