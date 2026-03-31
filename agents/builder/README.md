# Builder Agent (Praxis Pattern)

The Builder is the engineering backbone of an Operaxon civilization. It writes code, manages infrastructure, handles deployments, and debugs production issues. The Builder pattern is named "Praxis" — from the Greek for practice or action — because its purpose is to turn plans into working systems.

## Role and Philosophy

The Builder operates under a simple doctrine: **build carefully, deploy confidently, document everything**. It does not cut corners on security. It does not skip tests to save time. It does not deploy without verification.

When a Governor issues a task that involves creating, modifying, or deploying software, the Builder is the agent that executes. It owns the full software lifecycle within its assigned scope — from writing the first line of code to confirming a successful production deploy.

The Builder is not a planner. It does not decide *what* to build. That responsibility belongs to the Governor or to a human operator. The Builder decides *how* to build it, and then does so.

## Domains

| Domain | Description |
|---|---|
| `code` | Writing, reading, and modifying source code across any language or framework |
| `infrastructure` | Managing servers, containers, cloud resources, and networking |
| `deployment` | Building, testing, and shipping artifacts to staging and production |
| `debugging` | Diagnosing failures, reading logs, tracing issues, and applying fixes |
| `architecture` | Evaluating system design, suggesting structural improvements, documenting technical decisions |

## Containment Policy

The Builder has **clearance level 7** — one of the highest in the standard agent hierarchy. This is necessary because engineering work inherently requires broad system access. However, high clearance comes with strict guardrails:

### Allowed Actions
- Read and write files within the workspace
- Execute shell commands (build scripts, test runners, linters)
- Search codebases
- Interact with git (commit, branch, merge)
- Perform web searches for documentation and troubleshooting

### Denied Actions
- **Database deletion** — The Builder can query and migrate databases but cannot drop them. Destructive database operations require a human operator.
- **Email sending** — The Builder is not a communications agent. If a deploy notification is needed, it delegates to a Communications agent.
- **Financial transactions** — The Builder has zero access to payment systems, billing APIs, or financial infrastructure.

### Approval-Gated Actions
- `deploy:*` — All deployments require Governor or human approval before execution.
- `delete:*` — Any destructive file or resource deletion requires approval.
- `git:push:main` — Pushing directly to the main branch requires approval. Feature branches are unrestricted.

This containment model ensures the Builder can move fast on low-risk work (writing code, running tests, pushing to feature branches) while requiring oversight for high-impact actions.

## Memory

The Builder uses **shared memory**, meaning its context and findings are visible to the Governor and to sibling agents in the same civilization. This is critical for coordination — when the Builder discovers a bug during deployment, that information should be immediately available to the Governor for re-planning.

## Customization

### Changing the model

The default model is `anthropic/claude-sonnet-4-6`. For complex architecture work, you may want to upgrade to `anthropic/claude-opus-4-6`. For high-volume, low-complexity tasks (formatting, linting, boilerplate generation), a lighter model may suffice.

```json
{
  "model": "anthropic/claude-opus-4-6"
}
```

### Adding tools

If your Builder needs access to additional systems — a Docker API, a Kubernetes client, a CI/CD pipeline — add them to both `tools` and `containment.allowedTools`:

```json
{
  "tools": ["read_file", "write_file", "execute_command", "search_code", "git", "docker", "kubectl"],
  "containment": {
    "allowedTools": ["read_file", "write_file", "execute_command", "search_code", "git", "web_search", "docker", "kubectl"]
  }
}
```

### Adjusting concurrency

The default `maxConcurrentActions` is 5. If your Builder handles large monorepos with parallel build steps, increase this. If you want tighter control, reduce it to 1 for strictly sequential execution.

### Tightening containment

For sensitive environments, you can add more actions to `requiresApproval`:

```json
{
  "requiresApproval": ["deploy:*", "delete:*", "git:push:main", "execute_command:sudo:*", "write_file:/etc/*"]
}
```

### Modifying the system prompt

The system prompt shapes the Builder's behavior and priorities. You can add project-specific instructions:

```json
{
  "systemPrompt": "You are a Builder agent in the Operaxon civilization. [...] Additional rules: Always use TypeScript. Prefer functional patterns. All PRs must include tests."
}
```

## Example Usage

A Governor might delegate to the Builder like this:

```
Task: Implement the new user authentication flow
Agent: builder
Priority: high
Context: Use the existing session store. Add rate limiting. Write integration tests.
```

The Builder would then autonomously write the code, run the test suite, commit to a feature branch, and report back to the Governor with a summary of changes and test results.
