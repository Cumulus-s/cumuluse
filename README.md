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
- `.agent/` - pipeline goal, plan, standards, and progress notes.
- `.codex/agents/engineering-pipeline-orchestrator.toml` - project-local orchestrator agent definition.
- `.codex/skills/eval-engineering-pipeline-orchestrator/` - deterministic eval for the orchestrator package.
- `out/engineering/agent-pipeline/` - start and handoff prompts for future agent-pipeline sessions.

The first version simulates trigger decisions in local state. Real Codex process execution should be added behind a backend or Codex app integration.

The orchestrator package is registered in `/Users/miguel/Documents/evals/agents/engineering-pipeline-orchestrator/`.
