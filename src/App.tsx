import { useState } from "react";
import { CodexUsePanel } from "./components/CodexUsePanel";
import { Workspace } from "./components/Workspace";
import { initialPipelineRun } from "./data/seed";
import type { PipelineRun } from "./types";

export default function App() {
  const [panelOpen, setPanelOpen] = useState(true);
  const [runs, setRuns] = useState<PipelineRun[]>([initialPipelineRun]);
  const activeRun = runs[0];

  function addRun(run: PipelineRun) {
    setRuns((current) => [run, ...current]);
  }

  return (
    <div className="app-shell">
      <CodexUsePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onRunCreated={addRun}
      />
      {!panelOpen ? (
        <button className="edge-tab" type="button" onClick={() => setPanelOpen(true)} aria-label="Open Codex Use panel">
          Codex
        </button>
      ) : null}
      <Workspace
        runs={runs}
        activeRun={activeRun}
        onOpenPanel={() => setPanelOpen(true)}
      />
    </div>
  );
}

