# Cumuluse

Local Codex and Claude Code panel for React apps, with a durable Python backend.

| Field | Value |
| --- | --- |
| GitHub repo | `Cumulus-s/cumuluse` |
| Current release | `v0.1.0` |
| License | MIT |
| Main users | Developers who want an in-app local agent control panel |
| Frontend package | `packages/cumuluse` |
| Backend package | `python/local_agent_panel` |

## What It Does

- Adds a black-first floating React drawer to a host app.
- Uploads and hashes local project files before agent runs.
- Stores project-local state under `.cumuluse/`.
- Runs a durable Python backend with SQLite WAL state.
- Tracks runs, events, stage manifests, approvals, diagnostics, and cancellation.
- Supervises Codex app-server over stdio JSON-RPC when available.
- Falls back to degraded `codex exec --json` behavior when the full app-server path is not available.
- Supports Claude Code stream-json integration when the local CLI is available.

## Quick Start

```bash
npx cumuluse init
npm run cumuluse:dev
```

From this repo:

```bash
npm install
npm run build:packages
npm run test:packages
cd python/local_agent_panel && python -m pytest
```

## React Usage

```tsx
import { CumuluseProvider, CumulusePanel } from "cumuluse";
import "cumuluse/styles.css";

export function App() {
  return (
    <CumuluseProvider>
      <CumulusePanel />
      <YourApp />
    </CumuluseProvider>
  );
}
```

## Repo Shape

- `packages/cumuluse` is the user-facing npm package with `CumuluseProvider`, `CumulusePanel`, `CumuluseClient`, branded CSS, and the `cumuluse` CLI.
- `packages/contracts` contains shared TypeScript contracts for files, turns, runs, events, CLI detection, and stage manifests.
- `packages/react-panel` contains the reusable controlled React drawer component.
- `packages/node-server` contains a lightweight demo Node backend.
- `python/local_agent_panel` contains the durable Python backend packaged as `cumuluse-backend`.
- `docs/` contains architecture, local Codex procedure, Tado Use analysis, and stage manifest docs.

## Safety

Cumuluse is local-only by default. The backend binds to `127.0.0.1`, writes
project-local `.cumuluse/` state, redacts diagnostics, and shows blocked or
degraded states instead of pretending local Codex or Claude Code is ready.

## Verification

```bash
npm run build
npm run build:packages
npm run test:packages
cd python/local_agent_panel && python -m pytest
```

## License

MIT. See `LICENSE`.
