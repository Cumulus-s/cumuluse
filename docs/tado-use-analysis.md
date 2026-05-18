# Tado Use Analysis

## What Tado Proved

Tado Use is a left-edge drawer that acts like a local agent control panel. The reusable pattern is not the SwiftUI code. The reusable pattern is the contract:

- one active drawer
- one subprocess at a time per turn
- finalized turns stored separately from live streaming state
- visible engine/model/permission badge
- clear stop button
- collapsible tool-call rows
- local bridge tools with typed inputs and outputs
- JSONL streaming parsed away from the UI hot path
- final flush before marking a run done
- clear unsupported-engine messages

## What Was Generalized

The new package foundation keeps these ideas:

- `PanelRun` is the durable unit of work.
- `SourceFile` always includes a stored path and SHA-256 hash.
- `StageManifest` is the handoff contract between stages.
- Process adapters detect local CLI support instead of assuming it.
- Streaming output is event-based, so React can consume SSE and WebSocket.
- Cancellation is a first-class backend action.
- Approvals are first-class backend records, not transient UI prompts.
- Raw upstream streams are stored redacted and linked from normalized events.

The main architecture change is that the reusable package now uses a Python backend as the durable layer. Tado proved the local drawer pattern. The package generalizes it through Codex app-server, SQLite state, diagnostics, and a stable HTTP/SSE/WebSocket API.

## What Was Not Copied

These stay Tado-specific and are not part of the package:

- SwiftUI navigation and app state
- Dome knowledge APIs
- Eternal and Dispatch workflows
- Tado canvas tiles and A2A tools
- Tado-specific MCP server names
- storage-root conventions under `~/Library/Application Support/Tado`

## Engineering Panel Gap

The current Engineering panel already has the right UI shape: drawer, composer, file chips, tool rows, and Plan/Data/Agents/QC tabs.

It is still simulated. It does not yet upload files to the Python backend, create backend runs, stream app-server events, show approval prompts from persisted approval records, or cancel a real process through the backend.

The new packages are the bridge from simulation to real local execution.
