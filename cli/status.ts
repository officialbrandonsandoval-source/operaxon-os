#!/usr/bin/env ts-node
/**
 * operaxon status
 * Check the status of a running Operaxon OS instance.
 */

import axios from 'axios';

const PORT = parseInt(process.env.PORT || '3000');
const BASE_URL = process.env.OPERAXON_URL || `http://localhost:${PORT}`;

interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
  timestamp: string;
  services: Record<string, string>;
}

async function status(): Promise<void> {
  console.log(`\n🔍 Checking Operaxon OS at ${BASE_URL}...\n`);

  try {
    const [healthRes, sessionsRes] = await Promise.allSettled([
      axios.get<HealthResponse>(`${BASE_URL}/health`, { timeout: 5000 }),
      axios.get(`${BASE_URL}/sessions`, { timeout: 5000 }),
    ]);

    if (healthRes.status === 'fulfilled') {
      const h = healthRes.value.data;
      const uptimeMin = Math.floor(h.uptime / 60);
      const uptimeSec = h.uptime % 60;

      console.log(`✅ Status: ${h.status.toUpperCase()}`);
      console.log(`   Version: ${h.version}`);
      console.log(`   Uptime:  ${uptimeMin}m ${uptimeSec}s`);
      console.log(`   Time:    ${new Date(h.timestamp).toLocaleString()}`);
      console.log(`\n   Services:`);
      Object.entries(h.services).forEach(([svc, state]) => {
        const icon = state === 'up' ? '🟢' : '🔴';
        console.log(`   ${icon} ${svc}: ${state}`);
      });
    } else {
      console.log(`❌ Gateway unreachable at ${BASE_URL}`);
      console.log(`   Error: ${(healthRes.reason as Error).message}`);
      console.log(`\n   Is Operaxon OS running? Try: operaxon start`);
      process.exit(1);
    }

    if (sessionsRes.status === 'fulfilled') {
      const s = sessionsRes.value.data;
      console.log(`\n   WebSocket connections: ${s.connections}`);
    }

    console.log(`\n   Endpoints:`);
    console.log(`   GET  ${BASE_URL}/health`);
    console.log(`   POST ${BASE_URL}/agent/message`);
    console.log(`   WS   ws://localhost:${PORT}`);
    console.log('');

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Status check failed: ${msg}`);
    process.exit(1);
  }
}

status();
