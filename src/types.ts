export type PipelineStatus = "drafted" | "running" | "blocked" | "ready";

export type AgentEngine = "codex";

export type WorkspaceSurface = "plan" | "data" | "agents" | "qc";

export interface SourceFile {
  id: string;
  name: string;
  size: number;
  type: string;
  extension: string;
  lastModified: string;
  preview?: string;
  confidence: "uploaded" | "needs-ingest" | "indexed";
}

export interface ToolCall {
  id: string;
  name: string;
  input: string;
  output: string;
  status: "pending" | "complete" | "failed";
}

export interface ConversationTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolCalls: ToolCall[];
  files?: SourceFile[];
  createdAt: string;
  engine: AgentEngine;
}

export interface PipelineStage {
  id: string;
  label: string;
  owner: string;
  status: PipelineStatus;
  output: string;
}

export interface AgentPackage {
  id: string;
  name: string;
  purpose: string;
  trigger: string;
  skills: string[];
}

export interface PipelineOutput {
  id: string;
  label: string;
  path: string;
  type: "3d" | "workbook" | "graph" | "manifest" | "review" | "skill";
  status: PipelineStatus;
  description: string;
}

export interface PipelineRun {
  id: string;
  title: string;
  request: string;
  sourceFiles: SourceFile[];
  status: PipelineStatus;
  stages: PipelineStage[];
  packages: AgentPackage[];
  skills: string[];
  outputs: PipelineOutput[];
  createdAt: string;
}

export interface RouteResult {
  title: string;
  response: string;
  status: PipelineStatus;
  stages: PipelineStage[];
  packages: AgentPackage[];
  skills: string[];
  outputs: PipelineOutput[];
  toolCalls: ToolCall[];
}
