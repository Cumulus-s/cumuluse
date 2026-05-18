# Progress

2026-05-15

- Read current `AGENTS.md`.
- Confirmed the project was not a git repository and contained only `AGENTS.md`.
- Indexed the folder with Cumulus. The index is small because only one source file existed before bootstrap.
- Inspected Tado Use references:
  - `/Users/miguel/Documents/tado/Sources/Tado/Views/TadoUsePanel.swift`
  - `/Users/miguel/Documents/tado/Sources/Tado/Views/TadoUseTurnRow.swift`
  - `/Users/miguel/Documents/tado/Sources/Tado/Services/TadoUseState.swift`
  - `/Users/miguel/Documents/tado/Sources/Tado/Services/TadoUseEngine.swift`
  - `/Users/miguel/Documents/tado/Sources/Tado/Services/TadoUseAutonomousHandlers.swift`
- Bootstrapped a React + Vite app with a local Codex Use simulation and engineering pipeline workspace.
- Added `.codex/agents/engineering-pipeline-orchestrator.toml`.
- Added `.codex/skills/eval-engineering-pipeline-orchestrator/` with a deterministic JSON evaluator.
- Registered and ran the package under `/Users/miguel/Documents/evals/agents/engineering-pipeline-orchestrator/`; latest rating is `excellent`.
- Fixed workspace tabs so Plan, Data, Agents, and QC switch real views.
- Added file attachment support to the Codex Use composer. Uploaded files are stored as local source metadata on each run and shown in the side rail and Data surface.

2026-05-17

- Re-inspected Engineering and Tado Use before editing.
- Verified local CLI reality:
  - Codex wrapper exists, but the installed package is broken because the vendor binary path is empty.
  - Claude help supports stream-json, partial messages, MCP config, and session IDs.
  - Claude smoke execution fails because org subscription access is disabled for Claude Code.
- Added `@local-agent-panel/contracts`.
- Added `@local-agent-panel/react`.
- Added `@local-agent-panel/server`.
- Added Python package `local-agent-panel` with SQLite run state, stage manifest writer, CLI detection, optional FastAPI app, subprocess supervisor, and tests.
- Added docs for Tado Use analysis, architecture, local Codex procedure, and stage manifests.
- Reworked the Python package as the primary backend:
  - project-local `.agent-panel/config.toml`, later rebranded toward `.cumuluse/config.toml`
  - SQLite WAL registry
  - append-only normalized events
  - redacted raw JSONL and stderr artifacts
  - approval records and decisions
  - diagnostics bundles
  - tiered ingestion
  - FastAPI HTTP, SSE, and WebSocket API
  - `CodexAppServerAdapter` over stdio JSON-RPC
  - degraded `codex exec --json` fallback
- Verified current official Codex app-server approval shape: approvals are server-initiated JSON-RPC requests and must be answered by request id.
- Updated the adapter to map panel decisions to Codex decisions:
  - `allow_once` -> `accept`
  - `deny` -> `decline`
  - `cancel` -> `cancel`
- Local Codex remains blocked because `/opt/homebrew/bin/codex` points to a missing vendor binary.

2026-05-18

- Added the branded `cumuluse` npm package with:
  - `CumuluseProvider`
  - `CumulusePanel`
  - `CumuluseClient`
  - `useCumuluse`
  - default black-first Cumulus CSS
  - `cumuluse` CLI
- Implemented `npx cumuluse init`:
  - detects Vite React, Next.js, or generic React
  - creates `.cumuluse/config.toml`
  - creates generated React integration files under `src/cumuluse/`
  - adds `cumuluse:doctor`, `cumuluse:serve`, and `cumuluse:dev` scripts
  - manages `.cumuluse/venv` by default
  - supports `--skip-backend` for tests and config-only setup
- Rebranded the Python package metadata to `cumuluse-backend`.
- Added `cumuluse_backend` import wrappers while keeping `local_agent_panel` compatibility.
- Updated backend defaults toward `.cumuluse/backend`.
- Added package init tests for Vite and Next fixtures.
