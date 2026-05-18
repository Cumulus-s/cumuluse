# Local Codex Procedure

## Priority

The package uses Codex in this order:

1. `codex app-server` over stdio JSON-RPC
2. `codex exec --json` as degraded fallback
3. blocked state with exact reasons

The app-server path is the primary product path because it is designed for rich clients. It provides streamed thread, turn, item, approval, failure, and config events. The exec fallback is useful for headless runs, but it does not replace app-server behavior.

## Detection

`cumuluse doctor` and `cumuluse-backend doctor` check:

```bash
which codex
codex exec --help
codex app-server --help
```

When app-server appears available, doctor can also initialize it and call:

```text
initialize
initialized
config/read
configRequirements/read
```

The report stores:

- executable path
- `exec --json` support
- app-server support
- effective config when available
- admin/config requirements when available
- SQLite and artifact-vault status
- ready/degraded/blocked reasons

## Observed On This Machine

Date: 2026-05-17

`which codex` returned:

```text
/opt/homebrew/bin/codex
```

But both `codex exec --help` and `codex app-server --help` fail because the wrapper tries to spawn a missing vendor binary:

```text
/opt/homebrew/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/codex/codex
```

Current doctor status:

```text
blocked
```

Meaning:

```text
Codex wrapper is installed, but local Codex execution is unusable until the missing vendor binary is restored.
```

## App-Server Flow

The adapter starts:

```bash
codex app-server
```

Then it sends JSON-RPC messages over stdin/stdout:

```text
initialize
initialized
config/read
configRequirements/read
thread/start
turn/start
```

It normalizes server notifications such as:

```text
thread/*
turn/*
item/*
item/commandExecution/requestApproval
item/fileChange/requestApproval
item/tool/requestUserInput
serverRequest/resolved
```

Approval requests are server-initiated JSON-RPC requests. The backend stores the request id and responds to that same id with a Codex decision payload.

Panel decisions map to Codex decisions as:

```text
allow_once -> accept
deny       -> decline
cancel     -> cancel
```

## Fallback Exec Flow

When app-server is unavailable but non-interactive execution works, the backend can run:

```bash
codex exec --json "<prompt>"
```

The backend captures JSONL events, transcript text, raw redacted logs, and final diagnostics. This mode is marked degraded because it lacks the full rich-client app-server surface.

## Unsupported Cases

Show `blocked` when:

- `codex` is missing
- the wrapper exists but the vendor binary is missing
- `codex app-server --help` fails and `codex exec --help` does not prove fallback support
- app-server initialize fails
- config requirements block execution
- auth is missing
- network/model errors prevent a turn from starting

Do not invent support from docs alone. The backend reports the exact observed command output.

## Setup Steps

1. Repair or reinstall Codex CLI.
2. Run:

```bash
codex app-server --help
codex exec --help
```

3. Run:

```bash
npx cumuluse doctor --project /Users/miguel/Documents/engineering
```

4. Confirm status is `ready` or a known `degraded` fallback.
5. Run a dry run first.
6. Run a small real request with one text file.

## Troubleshooting

- Missing vendor binary: reinstall Codex CLI.
- App-server initialize failure: inspect `diagnostics-bundle.zip`.
- Config/admin block: inspect `configRequirements`.
- Auth failure: repair Codex auth outside the panel.
- Hanging turn: cancel through `POST /v1/runs/{run_id}/cancel` or WebSocket.
- Secret exposure concern: inspect `redaction-report.json`; diagnostics should not include full env or auth files.
