import express, { Application, Request, Response, NextFunction } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server } from 'http';
import { v4 as uuidv4 } from 'uuid';
import type { HealthStatus, OperaxonConfig } from '../types';

export class GatewayServer {
  private app: Application;
  private server: Server;
  private wss: WebSocketServer;
  private connections: Map<string, WebSocket> = new Map();
  private startTime: Date = new Date();

  constructor(private config: Partial<OperaxonConfig> = {}) {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // CORS
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });

    // Request logging
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      const health: HealthStatus = {
        status: 'healthy',
        version: process.env.npm_package_version || '0.1.0',
        uptime: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
        timestamp: new Date().toISOString(),
        services: {
          gateway: 'up',
          websocket: this.wss.clients.size >= 0 ? 'up' : 'down',
        },
      };
      res.json(health);
    });

    // Agent message endpoint
    this.app.post('/agent/message', async (req: Request, res: Response) => {
      try {
        const { content, sessionId, channel = 'http' } = req.body;

        if (!content) {
          res.status(400).json({ error: 'content is required' });
          return;
        }

        const message = {
          id: uuidv4(),
          sessionId: sessionId || uuidv4(),
          channel,
          role: 'user' as const,
          content,
          timestamp: new Date(),
        };

        // Broadcast to WebSocket clients
        this.broadcast({ type: 'message', payload: message });

        res.json({
          id: message.id,
          sessionId: message.sessionId,
          status: 'received',
          timestamp: message.timestamp,
        });
      } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Sessions list
    this.app.get('/sessions', (_req: Request, res: Response) => {
      res.json({
        connections: this.connections.size,
        timestamp: new Date().toISOString(),
      });
    });

    // Version info
    this.app.get('/', (_req: Request, res: Response) => {
      res.json({
        name: 'Operaxon OS',
        version: '0.1.0',
        runtime: 'open-core',
        docs: 'https://github.com/officialbrandonsandoval-source/operaxon-os',
      });
    });

    // 404
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      const id = uuidv4();
      this.connections.set(id, ws);

      console.log(`[WS] Client connected: ${id} (total: ${this.connections.size})`);

      ws.send(JSON.stringify({
        type: 'connected',
        id,
        timestamp: new Date().toISOString(),
        message: 'Connected to Operaxon OS Gateway',
      }));

      ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          console.log(`[WS] Message from ${id}:`, msg.type || 'unknown');
          // Echo back with processing info
          ws.send(JSON.stringify({
            type: 'ack',
            id: uuidv4(),
            originalType: msg.type,
            timestamp: new Date().toISOString(),
          }));
        } catch {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        }
      });

      ws.on('close', () => {
        this.connections.delete(id);
        console.log(`[WS] Client disconnected: ${id} (total: ${this.connections.size})`);
      });

      ws.on('error', (err) => {
        console.error(`[WS] Error for ${id}:`, err.message);
        this.connections.delete(id);
      });
    });
  }

  private broadcast(data: unknown): void {
    const payload = JSON.stringify(data);
    this.connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  }

  listen(port: number = 3000): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(port, () => {
        console.log(`🚀 Operaxon OS Gateway running on port ${port}`);
        console.log(`   HTTP: http://localhost:${port}`);
        console.log(`   WS:   ws://localhost:${port}`);
        console.log(`   Health: http://localhost:${port}/health`);
        resolve();
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss.close(() => {
        this.server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }
}

export function createGateway(config?: Partial<OperaxonConfig>): GatewayServer {
  return new GatewayServer(config);
}
