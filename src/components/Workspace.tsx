import {
  Box,
  Braces,
  CheckCircle2,
  Circle,
  FileSpreadsheet,
  GitBranch,
  Layers3,
  PanelLeftOpen,
  Route,
} from "lucide-react";
import type { ReactNode } from "react";
import type { PipelineRun, PipelineStage } from "../types";
import { agentPackages } from "../data/seed";

interface WorkspaceProps {
  runs: PipelineRun[];
  activeRun: PipelineRun;
  onOpenPanel: () => void;
}

export function Workspace({ runs, activeRun, onOpenPanel }: WorkspaceProps) {
  return (
    <main className="workspace">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-dot" />
          <span className="brand-name">engineering</span>
          <span className="brand-chip">Visualizer</span>
        </div>
        <nav className="surface-tabs" aria-label="Workspace surfaces">
          <button className="is-active" type="button">Plan</button>
          <button type="button">Data</button>
          <button type="button">Agents</button>
          <button type="button">QC</button>
        </nav>
        <button className="action-button" type="button" onClick={onOpenPanel}>
          <PanelLeftOpen size={15} />
          Codex Use
        </button>
      </header>

      <section className="workspace-grid">
        <aside className="side-rail" aria-label="Pipeline stages">
          <div className="rail-heading">
            <Route size={16} />
            Active pipeline
          </div>
          <h1>{activeRun.title}</h1>
          <p>{activeRun.request}</p>
          <div className="stage-list">
            {activeRun.stages.map((stage) => (
              <StageRow key={stage.id} stage={stage} />
            ))}
          </div>
        </aside>

        <section className="plan-surface" aria-label="Plan visualization workspace">
          <div className="plan-toolbar">
            <div>
              <span className="kicker">Source-backed workspace</span>
              <h2>Plan layers and output contracts</h2>
            </div>
            <div className="view-controls">
              <button className="is-active" type="button"><Layers3 size={14} /> Layers</button>
              <button type="button"><Box size={14} /> 3D</button>
              <button type="button"><FileSpreadsheet size={14} /> Excel</button>
              <button type="button"><GitBranch size={14} /> Graph</button>
            </div>
          </div>

          <div className="plan-board">
            <div className="plan-canvas" role="img" aria-label="Sample engineering plan layer preview">
              <svg viewBox="0 0 760 480" aria-hidden="true">
                <defs>
                  <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                    <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(26,26,26,0.08)" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="760" height="480" fill="url(#grid)" />
                <path d="M108 92H622V392H108Z" fill="none" stroke="#1a1a1a" strokeWidth="8" />
                <path d="M108 212H318M318 92V392M318 262H622M494 262V392" fill="none" stroke="#1a1a1a" strokeWidth="5" />
                <path d="M228 92v38M108 312h38M622 164h-38M494 392v-42" stroke="#a44718" strokeWidth="7" strokeLinecap="round" />
                <rect x="136" y="124" width="138" height="58" rx="4" fill="rgba(164,71,24,0.11)" stroke="#a44718" />
                <rect x="356" y="116" width="214" height="100" rx="4" fill="rgba(26,26,26,0.05)" stroke="rgba(26,26,26,0.35)" />
                <rect x="354" y="300" width="96" height="54" rx="4" fill="rgba(26,26,26,0.05)" stroke="rgba(26,26,26,0.35)" />
                <text x="136" y="236" fill="#1a1a1a" fontSize="18" fontFamily="Inter, system-ui">Room anchors</text>
                <text x="356" y="284" fill="#1a1a1a" fontSize="18" fontFamily="Inter, system-ui">Wall graph</text>
                <text x="520" y="350" fill="#a44718" fontSize="16" fontFamily="Inter, system-ui">QC required</text>
              </svg>
            </div>

            <div className="output-stack">
              <OutputCard icon={<Box size={16} />} label="3D scene" value="scene_contract.json" status="drafted" />
              <OutputCard icon={<FileSpreadsheet size={16} />} label="Workbook" value="rooms, areas, fixtures" status="queued" />
              <OutputCard icon={<GitBranch size={16} />} label="Graph" value="spaces, openings, dependencies" status="queued" />
              <OutputCard icon={<Braces size={16} />} label="Agent JSON" value="stage manifests + handoff" status="ready" />
            </div>
          </div>
        </section>

        <aside className="agent-column" aria-label="Agent packages">
          <div className="rail-heading">
            <Circle size={15} />
            Agent packages
          </div>
          <div className="package-list">
            {agentPackages.map((agentPackage) => (
              <article key={agentPackage.id} className="package-row">
                <div>
                  <h3>{agentPackage.name}</h3>
                  <p>{agentPackage.purpose}</p>
                </div>
                <span>{agentPackage.skills.length} skills</span>
              </article>
            ))}
          </div>
          <div className="run-history">
            <div className="rail-heading">
              <CheckCircle2 size={15} />
              Runs
            </div>
            {runs.map((run) => (
              <div key={run.id} className="run-row">
                <strong>{run.title}</strong>
                <span>{run.status}</span>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

function StageRow({ stage }: { stage: PipelineStage }) {
  return (
    <article className={`stage-row stage-row--${stage.status}`}>
      <span className="status-dot" />
      <div>
        <h3>{stage.label}</h3>
        <p>{stage.owner}</p>
        <small>{stage.output}</small>
      </div>
    </article>
  );
}

function OutputCard({
  icon,
  label,
  value,
  status,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  status: string;
}) {
  return (
    <article className="output-card">
      <span className="output-card__icon">{icon}</span>
      <div>
        <h3>{label}</h3>
        <p>{value}</p>
      </div>
      <span>{status}</span>
    </article>
  );
}
