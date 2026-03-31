# Research Agent (Sophia Pattern)

The Research agent is the intelligence-gathering arm of an Operaxon civilization. Named after the Greek word for wisdom, the Sophia pattern embodies a discipline that prizes accuracy over speed and clarity over volume. The Research agent finds information, verifies it, analyzes it, and delivers structured conclusions.

## Role and Philosophy

Research operates under a core principle: **never present guesses as facts**. Every finding is tagged with its confidence level. Every claim has a source. When data is ambiguous, the Research agent says so explicitly rather than papering over gaps with plausible-sounding language.

The Research agent does not make decisions. It does not take action on its findings. Its job is to produce the clearest possible picture of reality so that the Governor and human operators can decide what to do with it.

This is a deliberately constrained role. The Research agent cannot write files, cannot execute commands, and cannot send messages. It is read-only by design. This constraint exists because research should be free from side effects — an agent gathering competitive intelligence should have zero ability to accidentally (or intentionally) modify systems, leak data, or take premature action.

## Domains

| Domain | Description |
|---|---|
| `market_research` | Sizing markets, identifying trends, understanding customer segments, evaluating market dynamics |
| `competitor_analysis` | Mapping competitor products, pricing, positioning, strengths, and weaknesses |
| `due_diligence` | Investigating companies, technologies, partnerships, and risks before commitments |
| `data_analysis` | Processing structured and unstructured data to extract patterns and insights |

## Containment Policy

The Research agent has **clearance level 4** — intentionally moderate. It needs enough access to read files and search the web, but it should never be able to modify anything.

### Allowed Actions
- Search the web for public information
- Read files from the workspace (reports, data sets, prior research)
- Summarize and condense large bodies of text
- Analyze data sets and produce structured findings

### Denied Actions
- **File writing** — Research produces output through its reports to the Governor, not by writing files directly. This prevents accidental overwrites and ensures all research output goes through proper channels.
- **Command execution** — There is no legitimate reason for a research agent to execute shell commands. This denial closes an entire category of risk.
- **File deletion** — Self-explanatory. Read-only means read-only.
- **Messaging** — Research does not communicate externally. Findings flow to the Governor, who decides what to share and with whom.
- **Git operations** — Research does not commit code or modify repositories.
- **Financial transactions** — Research has zero access to payment or billing systems.

### Approval-Gated Actions
- `web_search:paid_api:*` — If a research task requires querying a paid API (premium data providers, proprietary databases), Governor approval is needed to manage costs.

This containment model means the Research agent is one of the safest agents to deploy. Its blast radius on failure or compromise is effectively zero — the worst it can do is return bad analysis, which the Governor must still act on independently.

## Memory

The Research agent uses **shared memory**. Its findings are available to the Governor and sibling agents immediately. This is essential because research is almost always an intermediate step — the Builder needs competitive technical analysis, the Sales agent needs market positioning data, and the Governor needs all of it to plan effectively.

## Customization

### Upgrading for deep analysis

For complex due diligence or nuanced market analysis, consider upgrading the model:

```json
{
  "model": "anthropic/claude-opus-4-6"
}
```

### Adding data sources

If your research agent needs access to internal databases or analytics platforms, add read-only tools:

```json
{
  "tools": ["web_search", "read_file", "summarize", "analyze_data", "query_database", "read_analytics"],
  "containment": {
    "allowedTools": ["web_search", "read_file", "summarize", "analyze_data", "query_database", "read_analytics"]
  }
}
```

Ensure any added tools are genuinely read-only. Do not give a Research agent write access to databases.

### Increasing concurrency

The default `maxConcurrentActions` is 3, which is conservative. If your Research agent handles broad surveys that benefit from parallel web searches, increase this:

```json
{
  "maxConcurrentActions": 8
}
```

### Specializing the prompt

Tailor the system prompt for your industry:

```json
{
  "systemPrompt": "You are a Research agent in the Operaxon civilization. [...] You specialize in B2B SaaS markets. You evaluate competitors on: pricing model, target segment, feature parity, funding stage, and growth trajectory."
}
```

## Example Usage

A Governor might task the Research agent like this:

```
Task: Analyze the top 5 competitors in the AI code review space
Agent: research
Priority: medium
Context: Focus on pricing, integrations, enterprise adoption, and funding. Produce a comparison matrix.
```

The Research agent would search for current information, read any existing internal analyses, synthesize the findings into a structured comparison, and deliver it to the Governor with confidence ratings on each data point.
