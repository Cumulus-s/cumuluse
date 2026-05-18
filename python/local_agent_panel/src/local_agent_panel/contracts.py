from __future__ import annotations

from typing import Any, Literal, TypedDict

AgentEngine = Literal["codex", "claude"]
PanelRunStatus = Literal[
    "drafted",
    "queued",
    "preflighting",
    "running",
    "waiting_for_approval",
    "blocked",
    "ready",
    "failed",
    "cancelled",
    "interrupted",
]
FileConfidence = Literal["uploaded", "needs-ingest", "indexed", "unsupported"]
ApprovalStatus = Literal["pending", "allowed", "denied", "cancelled", "expired"]
ApprovalKind = Literal["command", "file_change", "network", "tool", "unknown"]


class SourceFile(TypedDict, total=False):
    id: str
    name: str
    originalName: str
    size: int
    mimeType: str
    extension: str
    sha256: str
    storedPath: str
    previewText: str
    createdAt: str
    confidence: FileConfidence
    ingestTier: int
    previewAvailable: bool
    deepIngestAvailable: bool
    warnings: list[str]


class ToolCall(TypedDict, total=False):
    id: str
    name: str
    input: Any
    output: Any
    status: Literal["pending", "complete", "failed"]
    startedAt: str
    finishedAt: str


class PipelineOutput(TypedDict):
    id: str
    label: str
    path: str
    type: Literal["3d", "workbook", "graph", "manifest", "review", "skill", "log", "transcript"]
    status: PanelRunStatus
    description: str


class PanelRun(TypedDict, total=False):
    id: str
    title: str
    request: str
    engine: AgentEngine
    status: PanelRunStatus
    cwd: str
    sourceFiles: list[SourceFile]
    stages: list[dict[str, Any]]
    packages: list[dict[str, Any]]
    skills: list[str]
    outputs: list[PipelineOutput]
    createdAt: str
    updatedAt: str


class CliDetection(TypedDict, total=False):
    engine: AgentEngine
    executablePath: str | None
    available: bool
    supportsNonInteractive: bool
    supportsJsonStream: bool
    supportsMcpConfig: bool
    detectedCommand: list[str]
    version: str
    helpText: str
    error: str
    supportsAppServer: bool
    appServerError: str | None


class NormalizedEvent(TypedDict, total=False):
    event_id: str
    run_id: str
    thread_id: str | None
    turn_id: str | None
    type: str
    created_at: str
    source: str
    payload: dict[str, Any]
    raw_ref: str | None
    message: str


class ApprovalRecord(TypedDict, total=False):
    id: str
    runId: str
    threadId: str | None
    turnId: str | None
    itemId: str | None
    kind: ApprovalKind
    status: ApprovalStatus
    reason: str
    command: str | None
    cwd: str | None
    payload: dict[str, Any]
    createdAt: str
    resolvedAt: str | None
    decision: str | None


class CapabilityReport(TypedDict, total=False):
    status: Literal["ready", "degraded", "blocked"]
    projectRoot: str
    storageRoot: str
    codex: CliDetection
    appServer: dict[str, Any]
    effectiveConfig: dict[str, Any] | None
    configRequirements: dict[str, Any] | None
    artifactVault: dict[str, Any]
    sqlite: dict[str, Any]
    blockers: list[str]
    warnings: list[str]


class StageManifest(TypedDict):
    schemaVersion: int
    runId: str
    stageId: str
    sourceFiles: list[SourceFile]
    sourceHashes: dict[str, str]
    inputs: list[str]
    outputs: list[PipelineOutput]
    toolCalls: list[ToolCall]
    blockers: list[str]
    validation: list[dict[str, str]]
    nextStageContract: str
    diagnosticsPath: str
    redactionReportPath: str
