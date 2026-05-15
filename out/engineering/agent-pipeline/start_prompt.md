# Start Prompt

You are working in `/Users/miguel/Documents/engineering`.

Goal: continue building an architecture and engineering visualizer that lets an engineer turn plans and project data into 3D, spreadsheet, graph, and agent-readable outputs.

Source truth:
- Project instructions: `/Users/miguel/Documents/engineering/AGENTS.md`
- Pipeline state: `/Users/miguel/Documents/engineering/.agent/`
- Tado reference panel:
  - `/Users/miguel/Documents/tado/Sources/Tado/Views/TadoUsePanel.swift`
  - `/Users/miguel/Documents/tado/Sources/Tado/Views/TadoUseTurnRow.swift`
  - `/Users/miguel/Documents/tado/Sources/Tado/Services/TadoUseState.swift`
  - `/Users/miguel/Documents/tado/Sources/Tado/Services/TadoUseAutonomousHandlers.swift`

Current app:
- React + Vite + TypeScript.
- `src/components/CodexUsePanel.tsx` implements the left-edge Codex drawer.
- `src/lib/agentRouter.ts` maps engineer requests to pipeline stages, packages, and skills.
- `src/components/Workspace.tsx` renders plan layers, outputs, package registry, and run history.
- `.codex/agents/engineering-pipeline-orchestrator.toml` defines the project-local orchestrator.
- `.codex/skills/eval-engineering-pipeline-orchestrator/` validates the orchestrator contract.

Hard gates:
- Do not trust generated QC from file existence alone.
- Require source evidence, output evidence, and stage manifests for real pipeline acceptance.
- Label source truth vs generated or inferred facts.
- Do not claim real Codex execution until a backend process bridge exists.

Useful checks:

```bash
npm run build
python3 .codex/skills/eval-engineering-pipeline-orchestrator/scripts/eval_engineering_pipeline_orchestrator.py --json
npm run dev
```

Next likely work:
- Add upload/parsing adapters.
- Add real stage manifest JSON creation.
- Add backend command bridge for Codex pipeline/package execution.
