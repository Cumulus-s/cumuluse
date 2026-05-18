# Stage Manifest

The stage manifest is the durable handoff contract for a run stage.

It is written to:

```text
.cumuluse/backend/runs/<run-id>/stage_manifest.json
```

## Required Fields

```ts
{
  schemaVersion: 1,
  runId: string,
  stageId: string,
  sourceFiles: SourceFile[],
  sourceHashes: Record<string, string>,
  inputs: string[],
  outputs: PipelineOutput[],
  toolCalls: ToolCall[],
  blockers: string[],
  validation: Array<{
    id: string,
    status: "pass" | "fail" | "blocked",
    message: string
  }>,
  nextStageContract: string,
  diagnosticsPath: string,
  redactionReportPath: string
}
```

## Rules

- Every source file must have a SHA-256 hash.
- Unsupported deep parsing must appear as a blocker or `needs-ingest`.
- A run can be `ready` only if validation has a pass record.
- Failed, blocked, and cancelled runs must preserve blockers.
- Downstream stages must read the manifest before accepting outputs.
- Diagnostics are redacted by default and live beside the manifest.
- `redactionReportPath` records what kinds of sensitive values were removed.

## Example

```json
{
  "schemaVersion": 1,
  "runId": "run-123",
  "stageId": "agent-execution",
  "sourceFiles": [
    {
      "id": "file-1",
      "name": "rooms.csv",
      "originalName": "rooms.csv",
      "size": 47,
      "mimeType": "text/csv",
      "extension": "csv",
      "sha256": "abc123",
      "storedPath": ".cumuluse/backend/runs/run-123/sources/file-1-rooms.csv",
      "createdAt": "2026-05-17T00:00:00Z",
      "confidence": "uploaded"
    }
  ],
  "sourceHashes": {
    "file-1": "abc123"
  },
  "inputs": [
    "Create an Excel quantity summary from the attached file."
  ],
  "outputs": [
    {
      "id": "manifest",
      "label": "Stage manifest",
      "path": ".cumuluse/backend/runs/run-123/stage_manifest.json",
      "type": "manifest",
      "status": "blocked",
      "description": "Source hashes, blockers, validation, and next-stage contract."
    }
  ],
  "toolCalls": [],
  "blockers": [
    "Dry run requested."
  ],
  "validation": [
    {
      "id": "process-exit",
      "status": "blocked",
      "message": "Dry run requested."
    }
  ],
  "nextStageContract": "Downstream stages must inspect source hashes, transcript, blockers, and output paths before accepting this run.",
  "diagnosticsPath": ".cumuluse/backend/runs/run-123/diagnostics.json",
  "redactionReportPath": ".cumuluse/backend/runs/run-123/redaction-report.json"
}
```
