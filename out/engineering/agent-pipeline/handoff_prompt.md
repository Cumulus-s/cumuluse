# Handoff Prompt

Continue from `/Users/miguel/Documents/engineering`.

The first UI slice is implemented. Verify the current app, then extend the pipeline from local simulation to real execution.

Inspect first:
- `/Users/miguel/Documents/engineering/README.md`
- `/Users/miguel/Documents/engineering/src/lib/agentRouter.ts`
- `/Users/miguel/Documents/engineering/src/components/CodexUsePanel.tsx`
- `/Users/miguel/Documents/engineering/src/components/Workspace.tsx`
- `/Users/miguel/Documents/engineering/.agent/standards.md`
- `/Users/miguel/Documents/engineering/.codex/agents/engineering-pipeline-orchestrator.toml`
- `/Users/miguel/Documents/engineering/.codex/skills/eval-engineering-pipeline-orchestrator/SKILL.md`

Do not overwrite the current UI without checking the existing behavior. Keep the left-edge panel pattern from Tado Use: one active drawer, chat turns, engine badge, tool-call rows, stage routing, and source-grounded acceptance gates.

Required next output:
- A real execution bridge design that can safely trigger Codex pipelines and agent packages.
- A typed `stage_manifest.json` format.
- A small sample input path and a sample manifest written by the app or backend.

Run checks before reporting:

```bash
npm run build
python3 .codex/skills/eval-engineering-pipeline-orchestrator/scripts/eval_engineering_pipeline_orchestrator.py --json
```
