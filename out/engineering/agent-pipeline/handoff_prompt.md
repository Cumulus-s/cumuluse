# Handoff Prompt

Continue from `/Users/miguel/Documents/engineering`.

The first UI slice and Cumuluse package foundation are implemented. Verify the current app and packages, then wire the current Engineering UI to the Cumuluse backend.

Inspect first:
- `/Users/miguel/Documents/engineering/README.md`
- `/Users/miguel/Documents/engineering/src/lib/agentRouter.ts`
- `/Users/miguel/Documents/engineering/src/components/CodexUsePanel.tsx`
- `/Users/miguel/Documents/engineering/src/components/Workspace.tsx`
- `/Users/miguel/Documents/engineering/src/types.ts`
- `/Users/miguel/Documents/engineering/packages/contracts/src/index.ts`
- `/Users/miguel/Documents/engineering/packages/cumuluse/src/react.tsx`
- `/Users/miguel/Documents/engineering/packages/cumuluse/src/cli.ts`
- `/Users/miguel/Documents/engineering/packages/react-panel/src/client.ts`
- `/Users/miguel/Documents/engineering/packages/node-server/src/index.ts`
- `/Users/miguel/Documents/engineering/python/local_agent_panel/src/local_agent_panel/codex_app_server.py`
- `/Users/miguel/Documents/engineering/python/local_agent_panel/src/local_agent_panel/supervisor.py`
- `/Users/miguel/Documents/engineering/python/local_agent_panel/src/local_agent_panel/storage.py`
- `/Users/miguel/Documents/engineering/python/local_agent_panel/src/local_agent_panel/server.py`
- `/Users/miguel/Documents/engineering/docs/architecture.md`
- `/Users/miguel/Documents/engineering/docs/local-codex-procedure.md`
- `/Users/miguel/Documents/engineering/.agent/standards.md`
- `/Users/miguel/Documents/engineering/.codex/agents/engineering-pipeline-orchestrator.toml`
- `/Users/miguel/Documents/engineering/.codex/skills/eval-engineering-pipeline-orchestrator/SKILL.md`

Do not overwrite the current UI without checking the existing behavior. Keep the left-edge panel pattern from Tado Use: one active drawer, chat turns, engine badge, tool-call rows, stage routing, and source-grounded acceptance gates.

Required next output:
- Start from a host project with `npx cumuluse init`, then run `npm run cumuluse:dev`.
- Wire `CodexUsePanel.tsx` to `CumuluseClient` or replace it with the packaged `CumulusePanel`:
  - `POST /v1/uploads`
  - `POST /v1/runs`
  - `GET /v1/runs/:id/events.sse`
  - `POST /v1/approvals/:approval_id`
  - `POST /v1/runs/:id/cancel`
- Keep local simulation as fallback only when the backend is unavailable.
- Add a small sample upload flow that writes `.cumuluse/backend/runs/<run-id>/stage_manifest.json`.
- Render `waiting_for_approval` with allow once, deny, and cancel controls.
- Keep Codex blocked until `codex app-server --help` or the degraded `codex exec --help` fallback works on this machine.

Run checks before reporting:

```bash
npm run build
npm run build:packages
cd python/local_agent_panel && .venv/bin/python -m pytest && .venv/bin/python -m compileall src
python3 .codex/skills/eval-engineering-pipeline-orchestrator/scripts/eval_engineering_pipeline_orchestrator.py --json
```
