export type PipelineStatus = "drafted" | "running" | "blocked" | "ready";

export type AgentEngine = "codex";

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

export interface PipelineRun {
  id: string;
  title: string;
  request: string;
  status: PipelineStatus;
  stages: PipelineStage[];
  packages: AgentPackage[];
  skills: string[];
  createdAt: string;
}

export interface RouteResult {
  title: string;
  response: string;
  status: PipelineStatus;
  stages: PipelineStage[];
  packages: AgentPackage[];
  skills: string[];
  toolCalls: ToolCall[];
}

