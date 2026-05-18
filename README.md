# Engineering Visualizer

Architecture and engineering visualizer and processor.

This project is a first Codex-oriented shell for engineers who need to turn plans and project data into usable outputs:

- plan visualization
- AI-agent routing
- 3D, spreadsheet, graph, and review output planning
- pipeline handoff prompts for future Codex sessions

## Run

```bash
npm install
npm run dev
```

## Check

```bash
npm run build
```

## Current Shape

- `src/components/CodexUsePanel.tsx` - left-edge Codex control drawer inspired by Tado Use.
- `src/components/Workspace.tsx` - visual plan workspace and pipeline status surface.
- `src/lib/agentRouter.ts` - local router that maps engineer requests to pipeline stages, agent packages, and skills.
- File attachments are supported through the Codex Use composer. Attached files become `sourceFiles` on the pipeline run and inform routing.
- Workspace tabs now switch between Plan, Data, Agents, and QC surfaces.
- `.agent/` - pipeline goal, plan, standards, and progress notes.
- `.codex/agents/engineering-pipeline-orchestrator.toml` - project-local orchestrator agent definition.
- `.codex/skills/eval-engineering-pipeline-orchestrator/` - deterministic eval for the orchestrator package.
- `out/engineering/agent-pipeline/` - start and handoff prompts for future agent-pipeline sessions.

The first version simulates trigger decisions in local state. Real Codex process execution should be added behind a backend or Codex app integration.

The orchestrator package is registered in `/Users/miguel/Documents/evals/agents/engineering-pipeline-orchestrator/`.

## Cumuluse Package Foundation

This repo now also contains the first Cumuluse package foundation:

- `packages/cumuluse` - user-facing npm package with `CumuluseProvider`, `CumulusePanel`, `CumuluseClient`, branded CSS, and the `cumuluse` CLI.
- `packages/contracts` - language-neutral TypeScript contracts for files, turns, runs, events, CLI detection, and stage manifests.
- `packages/react-panel` - compatibility/internal reusable controlled React drawer component.
- `packages/node-server` - lightweight/demo local Node backend for uploads, hashes, run creation, SSE events, CLI detection, and cancellation.
- `python/local_agent_panel` - primary durable Python backend packaged as `cumuluse-backend`, with project-local `.cumuluse/`, SQLite WAL state, tiered ingestion, redacted diagnostics, approvals, Codex app-server supervision, degraded `codex exec --json` fallback, FastAPI/SSE/WebSocket API, and `cumuluse-backend` CLI.
- `docs/` - architecture, Tado Use analysis, local Codex procedure, and stage manifest schema.

Canonical Cumuluse flow:

```bash
npx cumuluse init
npm run cumuluse:dev
```

Local development commands:

```bash
npm run build:packages
npm run test:packages
cd python/local_agent_panel && .venv/bin/python -m pytest
```

Observed local CLI status on 2026-05-17:

- Codex wrapper exists at `/opt/homebrew/bin/codex`, but its vendor binary is missing, so both `codex app-server --help` and `codex exec --help` fail. Doctor reports `blocked`.
- Claude exists at `/opt/homebrew/bin/claude` and supports the expected stream-json flags, but the smoke run failed because org subscription access is disabled.
