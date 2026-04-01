# @operaxon/claw — Audited Code Execution

> Phase 4: Safe, audited code execution via ClawCode harness.

## What It Does

Provides a secure code execution layer for Operaxon agents:

- **Audited execution** — Every code run is logged + reversible
- **Security** — Tool allowlisting prevents unauthorized access
- **Sandbox isolation** — Code runs in isolated environments
- **Model-aware** — Token limits per model (Opus: 32K, Sonnet: 64K, Haiku: 64K)
- **Reversible** — Code execution can be undone

## Usage

### Direct API

```typescript
import { executor } from '@operaxon/claw';

const result = await executor.execute({
  code: 'const x = 1 + 1; console.log(x)',
  model: 'sonnet',
  tools: ['run_command'],
  sandbox: true,
  timeout: 30,
});

console.log(result.output); // "2"
console.log(result.reversible); // true
```

### As Operaxon Tool

```typescript
import { registerClawCodeTool } from '@operaxon/claw';

// In your Operaxon runtime initialization:
registerClawCodeTool(runtime);

// Agent can now use it:
// [Agent message]
// I need to run some Python code to process data.
// [Operaxon calls claw_execute tool]
// [ClawCode runs code safely]
// [Returns result with logs + reversibility info]
```

### Undo Execution

```typescript
import { executor } from '@operaxon/claw';

const result = await executor.execute({
  code: 'rm -rf /important/data',
  tools: ['run_command'],
});

// Oops! Undo it:
await executor.undo(result.executionId);
```

## Tool Definition

```javascript
{
  "name": "claw_execute",
  "description": "Execute code safely via ClawCode harness",
  "inputSchema": {
    "type": "object",
    "properties": {
      "code": { "type": "string" },
      "model": { "enum": ["opus", "sonnet", "haiku"] },
      "tools": { "type": "array", "items": { "type": "string" } },
      "maxTokens": { "type": "number" },
      "sandbox": { "type": "boolean" },
      "timeout": { "type": "number" }
    },
    "required": ["code"]
  }
}
```

## Allowed Tools

By default, these tools can be requested:

- `read_file` — Read files
- `write_file` — Write files
- `run_command` — Run shell commands
- `git_commit` — Make git commits
- `github_api` — Call GitHub API
- `linear_api` — Call Linear API

## Execution Logs

Every execution produces detailed logs:

```json
{
  "id": "1234567890-abc123def",
  "sessionId": "my-session-456",
  "code": "print('hello')",
  "model": "sonnet",
  "tools": ["read_file"],
  "timestamp": "2026-04-01T12:30:00Z",
  "result": {
    "success": true,
    "output": "hello",
    "tokensUsed": 150,
    "executionTime": 245,
    "logs": [
      "[EXEC] Model: sonnet, Max tokens: 64000",
      "[EXEC] Tools allowed: read_file",
      "[EXEC] Sandbox: on",
      "[SUCCESS] Execution completed in 245ms"
    ]
  }
}
```

## Architecture

```
┌─────────────────────────────────────┐
│  Operaxon Agent                     │
│  "Run this code please"             │
└──────────┬──────────────────────────┘
           │
           │ Invokes claw_execute tool
           ▼
┌─────────────────────────────────────┐
│  @operaxon/claw Tool Wrapper        │
│  - Validates input                  │
│  - Checks tool allowlist            │
│  - Creates execution log            │
└──────────┬──────────────────────────┘
           │
           │ Calls execute()
           ▼
┌─────────────────────────────────────┐
│  ClawCodeExecutor                   │
│  - Sets up environment              │
│  - Logs execution                   │
│  - Spawns ClawCode harness          │
│  - Captures output                  │
│  - Supports undo()                  │
└──────────┬──────────────────────────┘
           │
           │ Spawns binary
           ▼
┌─────────────────────────────────────┐
│  ClawCode Harness (Rust)            │
│  - Sandboxed execution              │
│  - Token limits                     │
│  - Error handling                   │
└─────────────────────────────────────┘
```

## Development

### Build

```bash
pnpm build
```

### Test

```bash
pnpm test
```

### Type Check

```bash
pnpm type-check
```

## Security Considerations

1. **Tool Allowlisting** — Only approved tools can be invoked
2. **Sandbox Isolation** — Code runs in restricted environment
3. **Execution Logging** — Every run creates audit trail
4. **Reversibility** — Operations can be undone (where applicable)
5. **Token Limits** — Model-specific limits prevent runaway costs

## Limitations

- Execution must complete within timeout (default: 30s)
- Some operations cannot be reversed (e.g., external API calls)
- Token limits are model-specific and enforced

## Next Steps (Phase 4.5)

- [ ] Integrate with actual ClawCode Rust binary
- [ ] Add rate limiting per agent
- [ ] Add cost estimation
- [ ] Add retry logic
- [ ] Add execution history UI
