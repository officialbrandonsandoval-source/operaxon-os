// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { RuntimeConfig } from '@operaxon/types';

export class Gateway {
  private server: ReturnType<typeof createServer> | null = null;
  private readonly config: RuntimeConfig;
  private readonly routes: Map<string, RouteHandler> = new Map();
  private requestCount = 0;
  private windowStart = Date.now();

  constructor(config: RuntimeConfig) {
    this.config = config;
  }

  route(method: string, path: string, handler: RouteHandler): void {
    this.routes.set(`${method.toUpperCase()}:${path}`, handler);
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => void this.handleRequest(req, res));

    return new Promise((resolve) => {
      this.server!.listen(this.config.port, this.config.host, () => {
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) { resolve(); return; }
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Rate limiting
    if (this.isRateLimited()) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
      return;
    }

    // CORS
    this.setCorsHeaders(res, req);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const routeKey = `${req.method ?? 'GET'}:${req.url ?? '/'}`;
    const handler = this.routes.get(routeKey);

    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    try {
      const body = await this.readBody(req);
      const context: RequestContext = {
        method: req.method ?? 'GET',
        path: req.url ?? '/',
        headers: req.headers as Record<string, string>,
        body,
      };
      await handler(context, res);
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  private isRateLimited(): boolean {
    const now = Date.now();
    if (now - this.windowStart > this.config.rateLimiting.windowMs) {
      this.requestCount = 0;
      this.windowStart = now;
    }
    this.requestCount++;
    return this.requestCount > this.config.rateLimiting.maxRequests;
  }

  private setCorsHeaders(res: ServerResponse, req: IncomingMessage): void {
    const origin = req.headers['origin'] ?? '';
    if (this.config.cors.allowedOrigins.includes(origin) || this.config.cors.allowedOrigins.includes('*')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', this.config.cors.allowedMethods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }
}

export interface RequestContext {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}

export type RouteHandler = (ctx: RequestContext, res: ServerResponse) => Promise<void>;
