# GOVERNOR — Identity & Auth Layer

> *"Who controls the agents?"*

GOVERNOR is the identity and governance system for Operaxon OS. Every agent has an identity. Every action is checked. Nothing happens without authorization.

---

## Architecture

```
Brandon (Sovereign Principal)
    │
    ▼
Governor (Root Node)
    │
    ├── Identity Registry  ← AgentIdentity objects for each agent
    ├── Permission Engine  ← RBAC: who can do what
    ├── Chain of Command   ← escalation hierarchy
    ├── Principal Registry ← human principals (sovereign/operator/viewer)
    └── Signer             ← HMAC-signed decisions for accountability
         │
         ▼
    Agents: Dominus, Praxis, Aurum, Hermes, Legatus, Sophia, Lex
```

---

## The Civilization — Pre-built Identities

| Agent | ID | Role | Key Capabilities | Limits |
|-------|-----|------|-----------------|--------|
| Dominus Sui | agt-000 | governor | `['*']` — everything | maxConcurrent: 10 |
| Praxis | agt-001 | builder | code, deploy, git | Requires approval: production deploys |
| Aurum | agt-002 | trader | market:read, trade:signal | Requires approval: trade:execute |
| Hermes | agt-003 | communicator | publish:*, message:send | Requires approval: external publish |
| Legatus | agt-004 | salesperson | crm:*, email:draft | Requires approval: contract:sign |
| Sophia | agt-005 | researcher | web:search, web:fetch, data:analyze | No destructive ops |
| Lex | agt-006 | legal | legal:*, contract:draft | Requires approval: contract:sign |

---

## Agent API

### Load the Civilization

```typescript
import { IdentityRegistry } from '@operaxon/governor';

const registry = new IdentityRegistry();
registry.loadCivilization(); // Loads all 7 agents

const praxis = registry.get('agt-001');
console.log(praxis.name); // "Praxis"
console.log(praxis.role); // "builder"
```

### Create a Custom Identity

```typescript
import { AgentIdentity } from '@operaxon/governor';

const customAgent = new AgentIdentity({
  id: 'agt-custom',
  name: 'My Custom Agent',
  role: 'worker',
  capabilities: ['web:search', 'report:write'],
  limits: {
    maxConcurrentTasks: 2,
    maxActionsPerMinute: 30,
    requiresApprovalFor: ['report:publish'],
  },
});
```

### Check Capabilities

```typescript
praxis.hasCapability('code'); // true
praxis.hasCapability('trade'); // false
praxis.isGovernor; // false

// Wildcard check
const dominus = new AgentIdentity({ id: 'agt-000', capabilities: ['*'], ... });
dominus.hasCapability('anything'); // true
dominus.isGovernor; // true
```

---

## Permission Engine (RBAC)

The `PermissionEngine` enforces who can do what.

```typescript
import { PermissionEngine, AgentIdentity } from '@operaxon/governor';

const engine = new PermissionEngine();

// Check if Praxis can write code
const result = engine.check(praxis, {
  agentId: 'agt-001',
  action: 'code:write',
});
// result.allowed = true
// result.requiresApproval = false

// Check if Praxis can deploy to production
const deployResult = engine.check(praxis, {
  agentId: 'agt-001',
  action: 'deploy:production',
});
// deployResult.allowed = false
// deployResult.requiresApproval = true
// deployResult.approvalLevel = 'operator'
```

### Risk Level Override

Actions with `riskLevel >= 8` always require sovereign approval regardless of role:

```typescript
const highRiskResult = engine.check(praxis, {
  agentId: 'agt-001',
  action: 'code:write',
  riskLevel: 9, // very high risk
});
// highRiskResult.allowed = false
// highRiskResult.approvalLevel = 'sovereign'
```

### Permission Table Summary

| Action | Builder | Trader | Communicator | Researcher | Legal |
|--------|---------|--------|-------------|-----------|-------|
| code:write | ✅ | ❌ | ❌ | ❌ | ❌ |
| deploy:staging | ✅ | ❌ | ❌ | ❌ | ❌ |
| deploy:production | ⚠️ operator | ❌ | ❌ | ❌ | ❌ |
| trade:execute | ❌ | ⚠️ sovereign | ❌ | ❌ | ❌ |
| publish:external | ❌ | ❌ | ⚠️ operator | ❌ | ❌ |
| web:search | ❌ | ❌ | ❌ | ✅ | ❌ |
| contract:sign | ❌ | ❌ | ❌ | ❌ | ⚠️ sovereign |
| memory:read:own | ✅ | ✅ | ✅ | ✅ | ✅ |

✅ = allowed | ❌ = denied | ⚠️ = requires approval (level shown)

---

## Signer — Tamper-Proof Decisions

Every agent decision is HMAC-signed for accountability and verification.

```typescript
import { AgentSigner } from '@operaxon/governor';

const signer = new AgentSigner(signingKey); // 32-byte key from keychain

// Sign a decision
const signed = signer.sign({
  agentId: 'agt-001',
  action: 'deploy:staging',
  outcome: 'executed',
  timestamp: new Date().toISOString(),
  metadata: { repo: 'operaxon-os', env: 'staging' },
});

// Verify it
const result = signer.verify(signed);
if (!result.valid) {
  console.error('Decision was tampered with:', result.reason);
}
```

### Identity Tokens (Agent-to-Agent)

For verifying the sender in agent-to-agent messages:

```typescript
// Agent A issues a token before messaging Agent B
const token = signer.issueToken('agt-001', 300); // 5 min TTL

// Agent B verifies the token
const verification = signer.verifyToken(token);
if (!verification.valid) {
  throw new Error('Unauthorized agent message');
}
```

---

## Chain of Command

The chain enforces the reporting hierarchy:

```
Brandon (sovereign) → Governor → Agents
```

```typescript
import { ChainOfCommand, PrincipalRegistry } from '@operaxon/governor';

const principals = new PrincipalRegistry();
principals.register({
  id: 'brandon',
  name: 'Brandon Sandoval',
  contact: 'telegram:8570412390',
  authority: 'sovereign',
});

const chain = new ChainOfCommand('gov-1', principals);
chain.registerAgent(agentConfig);

// Validate an action
const validation = chain.validateAction({
  agentId: 'agt-001',
  action: 'code:write',
  toolName: 'file:write',
  estimatedRiskLevel: 2,
});

if (!validation.allowed && validation.requiresEscalation) {
  const escalation = chain.escalate('agt-001', 'deploy:production', 'operator');
  // escalation.escalatedTo = 'brandon'
}
```

---

## Principal Hierarchy

Three authority levels:

| Level | Can Do |
|-------|--------|
| `sovereign` | Everything — approve irreversible actions, manage agents, modify config |
| `operator` | Manage agents, approve standard actions, run tasks |
| `viewer` | Read-only observation of civilization state |

```typescript
const registry = new PrincipalRegistry();
registry.register({ id: 'brandon', authority: 'sovereign', ... });
registry.register({ id: 'assistant', authority: 'operator', ... });

registry.isSovereign('brandon'); // true
registry.canApprove('assistant'); // true
registry.canApprove('viewer-1'); // false
```

---

## Agent Loop Integration

The `AgentLoop` wires GOVERNOR + MERIDIAN into a single execution pipeline:

```typescript
import { AgentLoop } from '@operaxon/runtime';

const loop = new AgentLoop({
  identity: praxisIdentity,
  meridian,
  permissions: engine,
  signer,
  // Called when approval is required
  onApprovalRequired: async (action, level) => {
    // Send approval request to principal via Telegram/Discord
    // Return true if approved, false if denied
    return await requestApproval(action, level);
  },
});

// Execute with full governance
const result = await loop.execute('deploy:staging', {
  toolName: 'git:push',
  riskLevel: 3,
  metadata: { repo: 'operaxon-os' },
});

if (result.success) {
  console.log('Action executed');
} else if (result.requiresApproval) {
  console.log(`Waiting for ${result.approvalLevel} approval`);
}
```

---

## Governance Model (for Customers)

When you deploy Operaxon OS for a client:

1. **You define the principals** — the humans who control the agents (sovereign = the business owner)
2. **You configure the agent roster** — which agents exist and what they can do
3. **GOVERNOR enforces the rules** — no agent can exceed its permissions
4. **Every action is audited** — HMAC-signed log of every decision
5. **Escalation is automatic** — high-risk actions route to the appropriate human

This is the key differentiator: Operaxon OS is the only agentic platform where **the customer controls the agents**, not the AI company.

### What Customers Get

- **Identity**: Every agent has a verified identity. No impersonation.
- **RBAC**: Role-based permissions out of the box. Auditable.
- **Chain of Command**: Clear escalation paths. Humans stay in control.
- **Audit Trail**: Tamper-proof log of every agent action.
- **Governance**: Documented model that satisfies compliance requirements.

---

## Configuration

The Governor loads configuration from `operaxon.config.json`:

```json
{
  "governor": {
    "name": "my-civilization",
    "model": "claude-sonnet-4-20250514",
    "memory": {
      "storagePath": "./data/memory",
      "encryptionKeyRef": "operaxon-memory-key",
      "maxMemoryLines": 200,
      "consolidationInterval": 24,
      "minSessionsBeforeConsolidation": 5
    },
    "principals": [
      {
        "id": "brandon",
        "name": "Brandon Sandoval",
        "contact": "telegram:8570412390",
        "authority": "sovereign"
      }
    ]
  },
  "agents": [...],
  "channels": [...],
  "runtime": { "port": 3100, "host": "127.0.0.1", ... }
}
```

---

## Security Notes

- Signing keys stored in OS keychain — never in config files
- Secret scanning in `validateConfig()` prevents accidental key exposure
- GOVERNOR rejects configs with embedded secrets at startup
- SSRF protection blocks requests to internal network ranges
- Principal registry prevents escalation — viewer cannot become sovereign
