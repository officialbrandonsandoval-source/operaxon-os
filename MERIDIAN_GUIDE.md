# MERIDIAN — Memory Consolidation Engine

> *"Synthesize what you've learned recently into durable, well-organized memories so that future sessions can orient quickly."*

MERIDIAN is the autonomous memory synthesis engine for Operaxon OS. Every agent learns. Every session compounds. Nothing is wasted.

---

## Architecture

```
Agent Session
    │
    ▼
Consolidator.logAction()  ──→  daily-logs/YYYY-MM-DD.log
    │
    ▼
Synthesizer.extractFromSession()  ──→  memory/YYYY-MM-DD.md
    │
    ▼
MeridianStorage.search()  ◀──  meridian.search('query')
    │
    ▼
MeridianEngine (Dream Engine)
    ├── Gate 1: Time (24h since last)
    ├── Gate 2: Session (5+ sessions since last)
    └── Gate 3: Lock (no concurrent consolidation)
         │
         ▼
    Phase 1: Orient  → read MEMORY.md
    Phase 2: Gather  → signals from logs, memories, transcripts
    Phase 3: Consolidate → write/update/delete memory files
    Phase 4: Prune   → enforce 200-line limit, regenerate index
```

---

## Three-Gate Consolidation

MERIDIAN only runs when all three gates pass:

| Gate | Condition | Purpose |
|------|-----------|---------|
| Time | 24+ hours since last consolidation | Prevents over-consolidation |
| Session | 5+ sessions since last consolidation | Ensures enough signal exists |
| Lock | No concurrent consolidation running | Prevents race conditions |

All three must pass. This is intentional — consolidation is expensive and should only run when there's meaningful new signal.

---

## Agent API

The `Meridian` class is the primary interface for agents.

```typescript
import { Meridian } from '@operaxon/meridian';

const meridian = new Meridian({
  storagePath: './data/memory',
  encryptionKeyRef: 'operaxon-memory-key', // OS keychain reference
  timeGateHours: 24,
  sessionGateCount: 5,
});

await meridian.initialize();
```

### Log an Action

Call after every meaningful agent action:

```typescript
await meridian.log('deployed new feature to staging', {
  agentId: 'agt-001',
  metadata: { feature: 'auth', environment: 'staging' },
});
```

### Search Memory

Retrieve relevant context before making decisions:

```typescript
const results = await meridian.search('what have we learned about deployment?');
// Returns: [{ content: '...', source: 'memory/2026-03-31.md', score: 0.8 }]

for (const result of results) {
  console.log(`[${result.source}] ${result.content}`);
}
```

### Process a Session

At the end of every session, synthesize lessons:

```typescript
const transcript = {
  sessionId: 'session-xyz',
  agentId: 'agt-001',
  startedAt: new Date().toISOString(),
  messages: [
    { role: 'user', content: '...', timestamp: '...' },
    { role: 'assistant', content: '...', timestamp: '...' },
  ],
};

const result = await meridian.processSession(transcript);
// result.lessons → extracted lessons written to memory/YYYY-MM-DD.md
```

### Write a Lesson Directly

For important insights that don't need synthesis:

```typescript
await meridian.writeLesson(
  'Always run integration tests before merging to main.',
  'agt-001',
);
```

### Run Consolidation

Triggered by cron or manually:

```typescript
// Check if ready and run if so
const result = await meridian.consolidateIfReady();
if (result) {
  console.log(`Consolidated: ${result.memoriesCreated} created, ${result.memoriesUpdated} updated`);
}

// Force run (for testing/manual)
await meridian.consolidateNow();
```

---

## Memory Structure

```
data/memory/
├── MEMORY.md              ← Index of all memories (auto-generated, ≤200 lines)
├── meridian-state.json    ← Gate state (last consolidation, session count, lock)
├── dream.lock             ← Distributed lock (acquired during consolidation)
├── daily-logs/
│   ├── 2026-03-31.log     ← Agent action logs (written per-session)
│   └── 2026-04-01.log
├── memory/
│   ├── 2026-03-31.md      ← Daily lessons extracted by Synthesizer
│   └── 2026-04-01.md
├── memories/
│   ├── {id}.mem           ← Long-term structured memory files (encrypted)
│   └── ...
├── transcripts/
│   ├── {session-id}.transcript
│   └── ...
├── records/
│   ├── {id}.json          ← JSON records for structured data
│   └── ...
└── audit.log              ← HMAC-signed audit trail
```

---

## Synthesizer

The Synthesizer extracts 1-2 durable lessons per session from raw transcript content.

### What It Extracts

| Category | Pattern Examples |
|----------|-----------------|
| `correction` | "Actually, that's wrong..." / "The correct approach is..." |
| `decision` | "I decided to..." / "Going with..." |
| `pattern` | "Every time..." / "I notice that..." |
| `process` | "Faster to..." / "Remember to..." |
| `warning` | "Never..." / "Avoid..." |

### Confidence Scores

Each lesson gets a confidence score (0-1). Lessons below 0.5 are filtered out. The higher the confidence, the more durable the lesson.

---

## Storage

MERIDIAN uses two complementary stores:

### JSON Store (structured data)
```typescript
await meridian.store.json.write({
  id: 'decision-001',
  type: 'decision',
  data: { choice: 'PostgreSQL', reason: 'Ecosystem + reliability' },
  tags: ['database', 'decision'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const record = await meridian.store.json.read('decision-001');
```

### Markdown Store (human-readable)
```typescript
await meridian.store.markdown.write('2026-03-31.md', content);
const entry = await meridian.store.markdown.read('2026-03-31.md');
```

### Search (Phase 2: keyword; Phase 3: vector)
```typescript
const results = await meridian.search('typescript deployment', 5);
// Returns ranked snippets from both JSON and markdown stores
```

---

## Integration with GOVERNOR

MERIDIAN and GOVERNOR work together through the `AgentLoop`:

```typescript
import { AgentLoop } from '@operaxon/runtime';
import { Meridian } from '@operaxon/meridian';
import { AgentIdentity, PermissionEngine, AgentSigner } from '@operaxon/governor';

const loop = new AgentLoop({
  identity: new AgentIdentity({ id: 'agt-001', name: 'Praxis', ... }),
  meridian,
  permissions: new PermissionEngine(),
  signer: new AgentSigner(signingKey),
});

// Every action is logged to memory automatically
const result = await loop.execute('deploy:staging', { riskLevel: 3 });
```

---

## Cron Schedule

Wire MERIDIAN consolidation into the runtime cron:

```typescript
import { CronEngine } from '@operaxon/runtime';

const cron = new CronEngine();
cron.register({
  id: 'meridian-consolidation',
  name: 'Memory Consolidation',
  schedule: '0 3 * * *', // daily at 3 AM
  enabled: true,
  handler: async () => {
    const result = await meridian.consolidateIfReady();
    if (result) {
      await meridian.log(`Consolidation complete: ${result.memoriesCreated} memories created`);
    }
  },
});

cron.start();
```

---

## Security

- Memory files are encrypted at rest (AES-256-GCM via OS keychain)
- All consolidation events are HMAC-signed to the audit log
- Lock prevents concurrent consolidation (filesystem lock with stale detection)
- Temporal reference normalization prevents date drift in old memories

---

## Phase 3 Upgrade Path

MERIDIAN is designed to upgrade without breaking changes:

| Phase | Search | Storage |
|-------|--------|---------|
| Phase 2 (current) | Keyword overlap | Local JSON + Markdown |
| Phase 3 | Vector embeddings (Ollama) | + PostgreSQL or Qdrant |

To add vector search: replace `MeridianStorage.search()` with `vector.ts` (Ollama embeddings).
