# Cumuluse

Polished local Codex and Claude Code panel for React apps, backed by a durable Python orchestrator.

```bash
npx cumuluse init
npm run cumuluse:dev
```

## What It Installs

- A black-first floating React drawer.
- `CumuluseProvider`, `CumulusePanel`, `CumuluseClient`, and `useCumuluse`.
- CSS variables for deep customization.
- Project-local `.cumuluse/` config.
- A managed `.cumuluse/venv` Python backend install.
- Scripts for doctor, serve, and dev.

## React

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

## Safety

Cumuluse is local-only by default. The backend binds to `127.0.0.1`, writes project-local `.cumuluse/` state, and shows blocked/degraded states instead of pretending local Codex or Claude Code is ready.
