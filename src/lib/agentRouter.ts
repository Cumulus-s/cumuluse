import type { AgentPackage, PipelineStage, RouteResult, SourceFile, ToolCall } from "../types";
import { agentPackages, defaultOutputs } from "../data/seed";

type RouteKey = "visual" | "data" | "skill" | "review" | "default";

const stageTemplates: Record<RouteKey, PipelineStage[]> = {
  visual: [
    stage("source-inventory", "Source inventory", "plan-spatial-anchor-agent", "ready", "Hash inputs and label source confidence."),
    stage("spatial-anchor", "Spatial anchoring", "plan-spatial-anchor-agent", "running", "Extract rooms, walls, openings, fixtures, and scale."),
    stage("scene-contract", "Scene contract", "engineering-output-builder", "drafted", "Prepare 3D-ready JSON and preview layers."),
    stage("visual-qc", "Visual QC", "visualization-qc-reviewer", "drafted", "Compare output geometry to source evidence."),
  ],
  data: [
    stage("source-inventory", "Source inventory", "plan-spatial-anchor-agent", "ready", "Hash inputs and label source confidence."),
    stage("quantity-pass", "Quantity pass", "engineering-output-builder", "running", "Build room, area, fixture, and material tables."),
    stage("graph-pass", "Graph pass", "engineering-output-builder", "drafted", "Create relationship graph nodes and edges."),
    stage("export-qc", "Export QC", "visualization-qc-reviewer", "drafted", "Check workbook tabs and graph data against sources."),
  ],
  skill: [
    stage("skill-scope", "Skill scope", "engineering-pipeline-orchestrator", "ready", "Define trigger examples and reusable resources."),
    stage("skill-draft", "Skill draft", "engineering-output-builder", "running", "Create SKILL.md, references, scripts, or assets."),
    stage("skill-validate", "Skill validation", "visualization-qc-reviewer", "drafted", "Run quick validation and sample task checks."),
  ],
  review: [
    stage("artifact-inventory", "Artifact inventory", "visualization-qc-reviewer", "ready", "Find outputs, source files, and manifests."),
    stage("source-compare", "Source comparison", "visualization-qc-reviewer", "running", "Inspect deliverables against plan truth."),
    stage("failure-matrix", "Failure matrix", "visualization-qc-reviewer", "drafted", "Name issues, severity, and required correction."),
  ],
  default: [
    stage("intent-read", "Intent read", "engineering-pipeline-orchestrator", "ready", "Classify the engineer request."),
    stage("package-select", "Package select", "engineering-pipeline-orchestrator", "running", "Pick specialist agents and skills."),
    stage("handoff", "Handoff prompt", "engineering-pipeline-orchestrator", "drafted", "Prepare the next actionable prompt."),
  ],
};

export function routeEngineeringRequest(input: string, files: SourceFile[] = []): RouteResult {
  const text = input.toLowerCase();
  const fileText = files.map((file) => `${file.name} ${file.extension} ${file.type}`).join(" ").toLowerCase();
  const combined = `${text} ${fileText}`;
  const hasPlanFile = files.some((file) => ["pdf", "dwg", "dxf", "ifc", "svg", "png", "jpg", "jpeg"].includes(file.extension));
  const hasDataFile = files.some((file) => ["csv", "xlsx", "xls", "json"].includes(file.extension));
  const wantsVisual = hasPlanFile || matches(text, ["3d", "render", "visual", "blender", "model", "scene", "plan", "floor"]);
  const wantsData = hasDataFile || matches(combined, ["excel", "spreadsheet", "quantity", "schedule", "graph", "data", "csv", "xlsx"]);
  const wantsSkill = matches(text, ["skill", "workflow", "reusable", "agent package", "agent-package"]);
  const wantsReview = matches(text, ["qc", "review", "compare", "failure", "unsupported", "validate"]);

  if (wantsReview) {
    return buildRoute({
      key: "review",
      title: "Source-grounded review",
      response: "I routed this to a QC pass. The package must inspect real deliverables, source files, and manifests before any ready claim.",
      packages: ["visualization-qc", "pipeline-orchestrator"],
      skills: ["agent-pipeline", "eval-end-to-end"],
      files,
    });
  }

  if (wantsSkill) {
    return buildRoute({
      key: "skill",
      title: "Skill creation workflow",
      response: "I routed this to a skill creation flow. It will define trigger examples, reusable resources, validation, and a handoff path for future Codex sessions.",
      packages: ["pipeline-orchestrator", "format-output-builder"],
      skills: ["skill-creator", "agent-package"],
      files,
    });
  }

  if (wantsData && !wantsVisual) {
    return buildRoute({
      key: "data",
      title: "Plan data export",
      response: "I routed this to a data-output pipeline. It will extract source-backed plan data, then prepare workbook, graph, and agent-readable outputs.",
      packages: ["plan-spatial-anchor", "format-output-builder", "visualization-qc"],
      skills: ["spreadsheets", "agent-pipeline", "agent-package"],
      files,
    });
  }

  if (wantsVisual || wantsData) {
    return buildRoute({
      key: "visual",
      title: "Plan visualization pipeline",
      response: "I routed this to the plan visualization pipeline. It starts with source inventory and spatial anchoring, then creates a 3D-ready scene contract and QC gate.",
      packages: ["plan-spatial-anchor", "format-output-builder", "visualization-qc"],
      skills: ["agent-pipeline", "agent-package", "cad-to-blender-pipeline-agent"],
      files,
    });
  }

  return buildRoute({
    key: "default",
    title: "Engineering request triage",
    response: "I routed this to the orchestrator first. The next step is to classify source files, output type, and whether a specialist package or new skill is needed.",
    packages: ["pipeline-orchestrator"],
    skills: ["agent-pipeline", "auto-mode-trust"],
    files,
  });
}

function buildRoute(args: {
  key: RouteKey;
  title: string;
  response: string;
  packages: string[];
  skills: string[];
  files: SourceFile[];
}): RouteResult {
  const packages = args.packages
    .map((id) => agentPackages.find((pkg) => pkg.id === id))
    .filter(Boolean) as AgentPackage[];

  return {
    title: args.title,
    response: args.response,
    status: "running",
    stages: stageTemplates[args.key],
    packages,
    skills: args.skills,
    outputs: defaultOutputs(args.key),
    toolCalls: toolCallsFor(args.title, packages, args.skills, args.files),
  };
}

function toolCallsFor(title: string, packages: AgentPackage[], skills: string[], files: SourceFile[]): ToolCall[] {
  const calls: ToolCall[] = [
    {
      id: crypto.randomUUID(),
      name: "codex_use.pipeline_select",
      input: JSON.stringify({ title }, null, 2),
      output: "pipeline selected",
      status: "complete",
    },
    {
      id: crypto.randomUUID(),
      name: "codex_use.agent_package_queue",
      input: JSON.stringify({ packages: packages.map((pkg) => pkg.name) }, null, 2),
      output: "agent packages queued in local run state",
      status: "complete",
    },
    {
      id: crypto.randomUUID(),
      name: "codex_use.skill_scope",
      input: JSON.stringify({ skills }, null, 2),
      output: "skills attached to the run contract",
      status: "complete",
    },
  ];

  if (files.length > 0) {
    calls.unshift({
      id: crypto.randomUUID(),
      name: "codex_use.file_ingest",
      input: JSON.stringify({
        files: files.map((file) => ({
          name: file.name,
          size: file.size,
          type: file.type || "unknown",
          extension: file.extension || "none",
          preview: file.preview ? file.preview.slice(0, 180) : undefined,
        })),
      }, null, 2),
      output: `${files.length} source file${files.length === 1 ? "" : "s"} attached to the run contract`,
      status: "complete",
    });
  }

  return calls;
}

function stage(
  id: string,
  label: string,
  owner: string,
  status: PipelineStage["status"],
  output: string,
): PipelineStage {
  return { id, label, owner, status, output };
}

function matches(input: string, needles: string[]): boolean {
  return needles.some((needle) => input.includes(needle));
}
