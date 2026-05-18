# Vite Basic Example

This folder is reserved for the first package-consuming example app.

The current root app already acts as the working visual example. The next step is to replace its local simulation with:

```ts
import { LocalAgentPanel } from "@local-agent-panel/react";
```

and backend calls to:

```text
POST /v1/files
POST /v1/runs
GET  /v1/runs/:id/events
POST /v1/runs/:id/cancel
```
