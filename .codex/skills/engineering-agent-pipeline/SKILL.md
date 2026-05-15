---
name: engineering-agent-pipeline
description: Route architecture and engineering plan requests into Codex pipeline stages, specialist agent packages, reusable skills, stage manifests, and source-grounded QC. Use when working in /Users/miguel/Documents/engineering or when an engineer asks to visualize plans, export data, build 3D outputs, create graph/workbook artifacts, or validate generated deliverables against source plans.
---

# Engineering Agent Pipeline

## Workflow

1. Read `/Users/miguel/Documents/engineering/AGENTS.md`.
2. Inspect `.agent/goal.md`, `.agent/standards.md`, and `.agent/progress.md`.
3. Identify source truth:
   - input plan files
   - project data files
   - prior stage manifests
   - accepted outputs
4. Route the request:
   - visualization: use spatial anchoring, scene contract, and visual QC.
   - data export: use quantity extraction, workbook/graph output, and export QC.
   - skill creation: use skill-creator and validate the skill.
   - package orchestration: use agent-package and register eval expectations.
   - review: inspect deliverables against source evidence.
5. Require a typed stage manifest for each major stage.
6. Label facts as measured, designed, generated, inferred, or unknown.
7. Produce a handoff prompt when work is not complete in the current session.

## Stage Manifest Contract

Each stage manifest must include:

- `stage_id`
- `source_inputs`
- `source_hashes`
- `confidence_labels`
- `tools`
- `outputs`
- `blockers`
- `validation_status`
- `next_stage_contract`

Do not accept a stage with missing source hashes, missing outputs, blockers, stale source evidence, or a validation contradiction.

## UI Contract

For the app surface, keep the Tado Use-inspired pattern:

- left-edge Codex drawer
- one active conversation
- engine badge
- finalized turns plus live turn state
- collapsible tool-call rows
- source-grounded run history
- no final-ready claim while a hard gate fails

## Checks

Run:

```bash
npm run build
```

Use browser verification for visible UI changes.

