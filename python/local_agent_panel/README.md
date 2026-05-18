# cumuluse-backend

Durable Python backend foundation for the Cumuluse local Codex and Claude Code panel.

It provides project-local `.cumuluse/` state, SHA-256 hashing, tiered ingestion, SQLite WAL run state, stage manifests, redacted diagnostics, approval records, Codex app-server supervision over stdio JSON-RPC, degraded `codex exec --json` fallback, and an optional FastAPI/SSE/WebSocket app.

```bash
cumuluse-backend doctor --project /Users/miguel/Documents/engineering
cumuluse-backend run "Summarize this workspace" --dry-run
cumuluse-backend serve --project /Users/miguel/Documents/engineering --port 8792
cumuluse-backend bundle <run-id>
```

`agent-panel` remains as a compatibility command during the package rename.
