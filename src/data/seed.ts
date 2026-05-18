import type { AgentPackage, PipelineOutput, PipelineRun } from "../types";

export const agentPackages: AgentPackage[] = [
  {
    id: "plan-spatial-anchor",
    name: "plan-spatial-anchor-agent",
    purpose: "Read plans and create room, wall, opening, fixture, and coordinate anchors.",
    trigger: "Use for PDFs, DWG, DXF, IFC, scanned plans, and scale questions.",
    skills: ["pdf", "cad-to-blender-pipeline-agent", "plan-spatial-anchor-agent"],
  },
  {
    id: "format-output-builder",
    name: "engineering-output-builder",
    purpose: "Turn extracted plan data into spreadsheets, graphs, JSON, and review bundles.",
    trigger: "Use when the engineer asks for Excel, schedules, graphs, quantities, or data exports.",
    skills: ["spreadsheets", "agent-package", "skill-creator"],
  },
  {
    id: "visualization-qc",
    name: "visualization-qc-reviewer",
    purpose: "Compare deliverables to source truth and reject stale or unsupported outputs.",
    trigger: "Use before accepting renders, 3D models, schedules, graph data, or client-facing packages.",
    skills: ["agent-pipeline", "eval-end-to-end", "smooth-software"],
  },
  {
    id: "pipeline-orchestrator",
    name: "engineering-pipeline-orchestrator",
    purpose: "Choose the right specialist packages and require stage manifests before handoff.",
    trigger: "Use for broad engineer requests that need multiple outputs or agent handoffs.",
    skills: ["agent-pipeline", "agent-package", "auto-mode-trust"],
  },
];

export const initialPipelineRun: PipelineRun = {
  id: "run-sample-plan-intake",
  title: "Sample plan intake",
  request: "Analyze the submitted building plan and prepare visualization outputs.",
  sourceFiles: [],
  status: "running",
  createdAt: new Date().toISOString(),
  packages: [agentPackages[0], agentPackages[1], agentPackages[2]],
  skills: ["agent-pipeline", "agent-package", "skill-creator"],
  outputs: defaultOutputs("visual"),
  stages: [
    {
      id: "source-inventory",
      label: "Source inventory",
      owner: "plan-spatial-anchor-agent",
      status: "ready",
      output: "Plan files, scale evidence, and confidence labels.",
    },
    {
      id: "geometry-extraction",
      label: "Geometry extraction",
      owner: "plan-spatial-anchor-agent",
      status: "running",
      output: "Rooms, walls, openings, fixtures, and coordinates.",
    },
    {
      id: "multi-format-output",
      label: "Multi-format output",
      owner: "engineering-output-builder",
      status: "drafted",
      output: "3D scene contract, spreadsheet tabs, graph nodes, and agent JSON.",
    },
    {
      id: "source-qc",
      label: "Source-grounded QC",
      owner: "visualization-qc-reviewer",
      status: "drafted",
      output: "Failure matrix, stage manifests, and handoff prompt.",
    },
  ],
};

export function defaultOutputs(kind: "visual" | "data" | "skill" | "review" | "default"): PipelineOutput[] {
  if (kind === "data") {
    return [
      output("workbook", "Workbook", "out/current/rooms-and-quantities.xlsx", "workbook", "running", "Room schedule, areas, quantities, and source notes."),
      output("graph", "Graph", "out/current/space-relationship-graph.json", "graph", "drafted", "Room adjacency and dependency graph."),
      output("manifest", "Stage manifest", "out/current/stage_manifest.json", "manifest", "drafted", "Source hashes, confidence labels, blockers, and next-stage contract."),
      output("review", "QC report", "out/current/export-qc.md", "review", "drafted", "Workbook and graph validation against source files."),
    ];
  }

  if (kind === "skill") {
    return [
      output("skill", "Skill package", ".codex/skills/new-engineering-skill/SKILL.md", "skill", "running", "Reusable Codex workflow with trigger language and validation."),
      output("manifest", "Eval manifest", "out/current/skill-eval.json", "manifest", "drafted", "Deterministic checks for the new skill."),
      output("review", "Validation notes", "out/current/skill-validation.md", "review", "drafted", "Quick validation and sample-task result."),
    ];
  }

  if (kind === "review") {
    return [
      output("review", "Failure matrix", "out/current/failure-matrix.md", "review", "running", "Expected source read, observed issue, severity, and correction."),
      output("manifest", "Manifest audit", "out/current/stage_manifest_summary.json", "manifest", "drafted", "Stage manifest acceptance and contradiction checks."),
      output("graph", "Evidence graph", "out/current/source-evidence-graph.json", "graph", "drafted", "Links between deliverables, source files, and claims."),
    ];
  }

  if (kind === "default") {
    return [
      output("manifest", "Handoff prompt", "out/current/handoff_prompt.md", "manifest", "running", "Fresh prompt naming source files, packages, gates, and next step."),
      output("review", "Routing notes", "out/current/request-routing.md", "review", "drafted", "Reasoning for selected pipeline and missing inputs."),
    ];
  }

  return [
    output("scene", "3D scene", "out/current/scene_contract.json", "3d", "drafted", "3D-ready spaces, walls, openings, fixtures, and materials."),
    output("workbook", "Workbook", "out/current/rooms-and-quantities.xlsx", "workbook", "drafted", "Room schedule, areas, fixtures, and quantities."),
    output("graph", "Graph", "out/current/space-relationship-graph.json", "graph", "drafted", "Room relationships, openings, and dependencies."),
    output("manifest", "Agent JSON", "out/current/stage_manifest.json", "manifest", "ready", "Stage manifests, source hashes, blockers, and handoff."),
  ];
}

function output(
  id: string,
  label: string,
  path: string,
  type: PipelineOutput["type"],
  status: PipelineOutput["status"],
  description: string,
): PipelineOutput {
  return { id, label, path, type, status, description };
}

export const sampleRequests = [
  "Turn this floor plan into a 3D model and a room schedule",
  "Extract quantities into Excel and graph the room relationships",
  "Create a reusable skill for structural plan review",
  "Run QC against the latest render and tell me what is unsupported",
];
