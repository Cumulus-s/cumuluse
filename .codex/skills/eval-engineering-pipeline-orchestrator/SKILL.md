---
name: eval-engineering-pipeline-orchestrator
description: Evaluate the project-local engineering-pipeline-orchestrator Codex agent TOML and output contract for source-grounded plan-processing work. Use when updating /Users/miguel/Documents/engineering/.codex/agents/engineering-pipeline-orchestrator.toml, checking that it still routes engineering plan requests into pipelines/packages/skills, or producing JSON summary input for agent-package and evolve-codex-agent workflows.
---

# Eval Engineering Pipeline Orchestrator

## Quick Start

Run:

```bash
python3 /Users/miguel/Documents/engineering/.codex/skills/eval-engineering-pipeline-orchestrator/scripts/eval_engineering_pipeline_orchestrator.py --json
```

The script validates the project-local agent TOML and emits:

- `passed`
- `score`
- `checks`
- `agent_path`

## What It Checks

- Agent TOML exists and parses.
- `name` matches `engineering-pipeline-orchestrator`.
- `description` includes `Use when` trigger language.
- Instructions require source truth discovery.
- Instructions require stage manifests.
- Instructions require fact confidence labels.
- Instructions prohibit final-ready claims from summaries alone.
- Output contract requires pipeline, packages, skills, stages, source evidence, blockers, and next action.
- Good fixture passes the output rubric.
- Bad fixture fails the output rubric.

Read `references/rubric.md` before changing thresholds.

## Update Rules

- Tighten the agent first when the agent contract is weak.
- Tighten this eval when the desired contract changes.
- Do not weaken checks just to pass.
- Keep JSON compatible with `agent-package` and `evolve-codex-agent`: `passed`, `score`, and `checks` must stay present.

