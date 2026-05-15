import type { AgentPackage, PipelineRun } from "../types";

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
  status: "running",
  createdAt: new Date().toISOString(),
  packages: [agentPackages[0], agentPackages[1], agentPackages[2]],
  skills: ["agent-pipeline", "agent-package", "skill-creator"],
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

export const sampleRequests = [
  "Turn this floor plan into a 3D model and a room schedule",
  "Extract quantities into Excel and graph the room relationships",
  "Create a reusable skill for structural plan review",
  "Run QC against the latest render and tell me what is unsupported",
];

