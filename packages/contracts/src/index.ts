export type AgentEngine = "codex" | "claude";

export type PanelRunStatus =
  | "drafted"
  | "queued"
  | "preflighting"
  | "running"
  | "waiting_for_approval"
  | "blocked"
  | "ready"
  | "failed"
  | "cancelled"
  | "interrupted";

export type FileConfidence = "uploaded" | "needs-ingest" | "indexed" | "unsupported";

export interface SourceFile {
  id: string;
  name: string;
  originalName: string;
  size: number;
  mimeType: string;
  extension: string;
  sha256: string;
  storedPath: string;
  previewText?: string;
  createdAt: string;
  confidence: FileConfidence;
  ingestTier?: number;
  previewAvailable?: boolean;
  deepIngestAvailable?: boolean;
  warnings?: string[];
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
  output?: unknown;
  status: "pending" | "complete" | "failed";
  startedAt?: string;
  finishedAt?: string;
}

export interface ConversationTurn {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  files: SourceFile[];
  toolCalls: ToolCall[];
  engine: AgentEngine;
  createdAt: string;
}

export interface PipelineStage {
  id: string;
  label: string;
  owner: string;
  status: PanelRunStatus;
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
  type: "3d" | "workbook" | "graph" | "manifest" | "review" | "skill" | "log" | "transcript";
  status: PanelRunStatus;
  description: string;
}

export interface PanelRun {
  id: string;
  title: string;
  request: string;
  engine: AgentEngine;
  status: PanelRunStatus;
  cwd: string;
  sourceFiles: SourceFile[];
  stages: PipelineStage[];
  packages: AgentPackage[];
  skills: string[];
  outputs: PipelineOutput[];
  createdAt: string;
  updatedAt: string;
}

export interface StageManifestSourceFile {
  id: string;
  name: string;
  sha256: string;
  storedPath: string;
  confidence: FileConfidence;
}

export interface StageManifest {
  schemaVersion: 1;
  runId: string;
  stageId: string;
  sourceFiles: StageManifestSourceFile[];
  sourceHashes: Record<string, string>;
  inputs: string[];
  outputs: PipelineOutput[];
  toolCalls: ToolCall[];
  blockers: string[];
  validation: Array<{
    id: string;
    status: "pass" | "fail" | "blocked";
    message: string;
  }>;
  nextStageContract: string;
  diagnosticsPath: string;
  redactionReportPath: string;
}

export interface RunEvent {
  event_id: string;
  id?: string;
  run_id: string;
  runId?: string;
  thread_id?: string | null;
  threadId?: string | null;
  turn_id?: string | null;
  turnId?: string | null;
  type: string;
  source: string;
  message: string;
  payload?: unknown;
  data?: unknown;
  raw_ref?: string | null;
  created_at: string;
  createdAt?: string;
}

export interface CliDetection {
  engine: AgentEngine;
  executablePath?: string;
  available: boolean;
  supportsNonInteractive: boolean;
  supportsJsonStream: boolean;
  supportsMcpConfig: boolean;
  detectedCommand?: string[];
  version?: string;
  helpText?: string;
  error?: string;
  supportsAppServer: boolean;
  appServerError?: string | null;
}

export interface ApprovalRecord {
  id: string;
  runId: string;
  threadId?: string | null;
  turnId?: string | null;
  itemId?: string | null;
  kind: "command" | "file_change" | "network" | "tool" | "unknown";
  status: "pending" | "allowed" | "denied" | "cancelled" | "expired";
  reason: string;
  command?: string | null;
  cwd?: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  resolvedAt?: string | null;
  decision?: string | null;
}

export interface CapabilityReport {
  status: "ready" | "degraded" | "blocked";
  projectRoot: string;
  storageRoot: string;
  codex: CliDetection;
  appServer: Record<string, unknown>;
  effectiveConfig?: Record<string, unknown> | null;
  configRequirements?: Record<string, unknown> | null;
  artifactVault: Record<string, unknown>;
  sqlite: Record<string, unknown>;
  blockers: string[];
  warnings: string[];
}

export interface CreateRunRequest {
  request: string;
  engine?: AgentEngine;
  cwd?: string;
  sourceFileIds?: string[];
  dryRun?: boolean;
}

export interface CreateRunResponse {
  run: PanelRun;
  eventsUrl: string;
  manifestPath: string;
}

export interface UploadFileRequest {
  name: string;
  mimeType?: string;
  contentBase64: string;
}

export interface UploadFileResponse {
  file: SourceFile;
}

export interface RunStatusResponse {
  run: PanelRun;
  events: RunEvent[];
  approvals?: ApprovalRecord[];
}
