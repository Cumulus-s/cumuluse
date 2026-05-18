# Architecture

## Direction

The reusable panel is now packaged as Cumuluse and remains Python-first.

The durable backend is `cumuluse-backend` from `python/local_agent_panel`. It owns project-local state, run supervision, uploads, ingestion, approvals, diagnostics, and the stable app-facing API. React packages depend on this API contract, not on Codex internals.

Primary execution path:

```text
Cumuluse panel -> Python FastAPI backend -> codex app-server over stdio JSON-RPC
```

Fallback execution path:

```text
Cumuluse panel -> Python backend -> codex exec --json
```

The fallback is degraded/headless. It is useful for automation and simple transcript capture, but it does not provide the same rich approval, history, and app-server event surface.

## Package Family

### NPM

`cumuluse` is the user-facing package.

It provides:

- `CumuluseProvider`
- `CumulusePanel`
- `CumuluseClient`
- `useCumuluse`
- default black-first Cumulus CSS
- TypeScript contracts
- `cumuluse` CLI
- `npx cumuluse init`

`@local-agent-panel/contracts` and `@local-agent-panel/react` are compatibility/internal package foundations.

### Python

`cumuluse-backend` is the reliability layer.

It provides:

- project-local `.cumuluse/backend/`
- `.cumuluse/config.toml` for this package only
- SQLite registry with WAL mode
- append-only normalized event log
- redacted raw upstream JSONL and stderr tails
- run manifests
- approval records and audit trail
- diagnostics bundles
- tiered file ingestion
- Codex app-server adapter
- degraded `codex exec --json` fallback
- FastAPI HTTP, SSE, and WebSocket API
- CLI commands:
  - `cumuluse-backend doctor`
  - `cumuluse-backend serve`
  - `cumuluse-backend run`
  - `cumuluse-backend status`
  - `cumuluse-backend stop`
  - `cumuluse-backend bundle`

`@local-agent-panel/server` remains a lightweight Node demo backend. It can hash files, create simple runs, stream demo events, and detect local CLIs. It is not the primary reliability layer.

## Shared Contracts

The stable event envelope is:

```ts
{
  event_id: string,
  run_id: string,
  thread_id?: string | null,
  turn_id?: string | null,
  type: string,
  created_at: string,
  source: "local_agent_panel" | "codex.app_server" | "codex.exec",
  payload: Record<string, unknown>,
  raw_ref?: string | null
}
```

Run states are:

```text
drafted
queued
preflighting
running
waiting_for_approval
blocked
ready
failed
cancelled
interrupted
```

Approval decisions exposed to the panel are:

```text
allow_once
deny
cancel
```

The Codex app-server adapter maps these to Codex decision payloads:

```text
allow_once -> accept
deny       -> decline
cancel     -> cancel
```

## Execution Flow

1. User runs `npx cumuluse init`.
2. Init creates `.cumuluse/config.toml`, `.cumuluse/venv`, generated React files, and package scripts.
3. User starts `npm run cumuluse:dev` or `npm run cumuluse:serve`.
4. User opens the panel.
5. Frontend calls `GET /v1/capabilities?cwd=...`.
6. User attaches files.
7. Frontend sends files to `POST /v1/uploads`.
8. Backend stores the file under `.cumuluse/backend/inbox/`.
9. Backend computes SHA-256 and preview metadata.
10. Backend creates a run and copies attached files under `.cumuluse/backend/runs/<run-id>/sources/`.
11. Backend writes an initial stage manifest.
12. Backend preflights Codex.
13. If `codex app-server` is available, backend starts it over stdio JSON-RPC.
14. Backend sends `initialize`, `initialized`, `config/read`, and `configRequirements/read`.
15. Backend starts a thread and turn.
16. Backend stores raw JSONL plus normalized events.
17. SSE streams normalized events to the UI.
18. WebSocket supports approval and cancellation control.
19. Approval requests set the run to `waiting_for_approval`.
20. Approval decisions are audited and sent back to the app-server request id.
21. Completion writes transcript, manifest, diagnostics, and redaction report.

## File Ingestion

Current tiers:

- full preview: `txt`, `md`, `json`, `csv`, `svg`, `html`
- structured preview: `xlsx`
- optional text extraction: `pdf` when `pypdf` is installed
- hash/store/metadata only: CAD, IFC, images, unknown binaries

Unsupported deep parsing is represented as `needs-ingest`. The backend must not claim source-grounded understanding for files that were only stored and hashed.

## Public API

Implemented HTTP routes:

- `GET /v1/health`
- `GET /v1/capabilities?cwd=...`
- `POST /v1/uploads`
- `POST /v1/threads`
- `POST /v1/threads/{thread_id}/turns`
- `POST /v1/runs`
- `GET /v1/runs/{run_id}`
- `GET /v1/runs/{run_id}/events.sse`
- `GET /v1/runs/{run_id}/diagnostics`
- `POST /v1/approvals/{approval_id}`
- `POST /v1/runs/{run_id}/cancel`
- `WS /v1/ws`

`POST /v1/files` is kept as a compatibility alias for the earlier Node/backend prototype.

## Safety Decisions

- Do not write Codex config from the panel in v1.
- Keep `.cumuluse/config.toml` scoped to this package only.
- Do not expose arbitrary MCP server creation.
- Show MCP-related status and tool calls when Codex emits them.
- Store redacted raw logs, not unredacted environment or auth files.
- Use argv arrays for subprocess execution.
- Use process groups for cleanup.
- Preserve blocked states when Codex is missing or broken.
- Never mark a run `ready` unless validation passes.

## Current Integration Boundary

The current Engineering app still uses frontend-local simulation in `src/components/CodexUsePanel.tsx`. The reusable Cumuluse package foundation now exists beside it.

The exact next implementation step is to wire the current drawer to the Python backend:

1. run `npm run cumuluse:dev` in a host project initialized by `npx cumuluse init`
2. call `CumuluseClient.capabilities()` when the drawer opens
3. replace local file conversion with `CumuluseClient.upload(file)`
4. replace local run creation with `CumuluseClient.createRun(...)`
5. subscribe to `CumuluseClient.events(runId, ...)`
6. render `waiting_for_approval` with approve, deny, and cancel controls over WebSocket or `POST /v1/approvals/{approval_id}`
