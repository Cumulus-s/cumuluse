import {
  AlertTriangle,
  Box,
  Braces,
  CheckCircle2,
  Circle,
  Database,
  FileArchive,
  FileSpreadsheet,
  GitBranch,
  Layers3,
  PanelLeftOpen,
  Route,
  ShieldCheck,
  Table2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { PipelineOutput, PipelineRun, PipelineStage, SourceFile, WorkspaceSurface } from "../types";
import { agentPackages } from "../data/seed";

interface WorkspaceProps {
  runs: PipelineRun[];
  activeRun: PipelineRun;
  onOpenPanel: () => void;
}

export function Workspace({ runs, activeRun, onOpenPanel }: WorkspaceProps) {
  const [activeSurface, setActiveSurface] = useState<WorkspaceSurface>("plan");

  return (
    <main className="workspace">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-dot" />
          <span className="brand-name">engineering</span>
          <span className="brand-chip">Visualizer</span>
        </div>
        <nav className="surface-tabs" aria-label="Workspace surfaces">
          {[
            ["plan", "Plan"],
            ["data", "Data"],
            ["agents", "Agents"],
            ["qc", "QC"],
          ].map(([surface, label]) => (
            <button
              key={surface}
              className={activeSurface === surface ? "is-active" : ""}
              type="button"
              aria-pressed={activeSurface === surface}
              onClick={() => setActiveSurface(surface as WorkspaceSurface)}
            >
              {label}
            </button>
          ))}
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
          {activeRun.sourceFiles.length > 0 ? (
            <div className="source-file-summary">
              <div className="rail-heading">
                <FileArchive size={15} />
                Source files
              </div>
              {activeRun.sourceFiles.map((file) => (
                <SourceFileRow key={file.id} file={file} />
              ))}
            </div>
          ) : null}
          <div className="stage-list">
            {activeRun.stages.map((stage) => (
              <StageRow key={stage.id} stage={stage} />
            ))}
          </div>
        </aside>

        <section className="plan-surface" aria-label={`${activeSurface} workspace`}>
          {activeSurface === "plan" ? <PlanSurface run={activeRun} /> : null}
          {activeSurface === "data" ? <DataSurface run={activeRun} /> : null}
          {activeSurface === "agents" ? <AgentsSurface run={activeRun} /> : null}
          {activeSurface === "qc" ? <QCSurface run={activeRun} /> : null}
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

function PlanSurface({ run }: { run: PipelineRun }) {
  return (
    <>
      <SurfaceHeader
        kicker="Source-backed workspace"
        title="Plan layers and output contracts"
        controls={[
          ["layers", <Layers3 size={14} />, "Layers", true],
          ["3d", <Box size={14} />, "3D", false],
          ["excel", <FileSpreadsheet size={14} />, "Excel", false],
          ["graph", <GitBranch size={14} />, "Graph", false],
        ]}
      />

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

        <OutputStack outputs={run.outputs} />
      </div>
    </>
  );
}

function DataSurface({ run }: { run: PipelineRun }) {
  return (
    <>
      <SurfaceHeader
        kicker="Data outputs"
        title="Files, tables, and graph contracts"
        controls={[
          ["sources", <FileArchive size={14} />, "Sources", true],
          ["tables", <Table2 size={14} />, "Tables", false],
          ["graph", <GitBranch size={14} />, "Graph", false],
        ]}
      />
      <div className="data-grid">
        <section className="data-panel">
          <h3>Uploaded source files</h3>
          {run.sourceFiles.length > 0 ? (
            <div className="source-table">
              {run.sourceFiles.map((file) => (
                <SourceFileRow key={file.id} file={file} />
              ))}
            </div>
          ) : (
            <p>No files attached yet. Add PDFs, CAD files, spreadsheets, JSON, or images through Codex Use.</p>
          )}
        </section>
        <section className="data-panel">
          <h3>Pipeline outputs</h3>
          <OutputStack outputs={run.outputs} compact />
        </section>
      </div>
    </>
  );
}

function AgentsSurface({ run }: { run: PipelineRun }) {
  return (
    <>
      <SurfaceHeader
        kicker="Agent routing"
        title="Packages and skills selected for this run"
        controls={[
          ["packages", <Circle size={14} />, "Packages", true],
          ["skills", <Braces size={14} />, "Skills", false],
        ]}
      />
      <div className="agent-surface-grid">
        {run.packages.map((agentPackage) => (
          <article key={agentPackage.id} className="package-row package-row--large">
            <div>
              <h3>{agentPackage.name}</h3>
              <p>{agentPackage.purpose}</p>
              <small>{agentPackage.trigger}</small>
            </div>
            <span>{agentPackage.skills.join(", ")}</span>
          </article>
        ))}
      </div>
    </>
  );
}

function QCSurface({ run }: { run: PipelineRun }) {
  const gates = [
    ["Source files attached", run.sourceFiles.length > 0, run.sourceFiles.length ? `${run.sourceFiles.length} file(s)` : "missing"],
    ["Stage manifests required", true, "required before delivery"],
    ["Source hashes required", run.sourceFiles.length > 0, "pending backend bridge"],
    ["Final-ready claim", false, "blocked until real validation"],
  ] as const;

  return (
    <>
      <SurfaceHeader
        kicker="Quality gates"
        title="Source-grounded acceptance checks"
        controls={[
          ["qc", <ShieldCheck size={14} />, "Gates", true],
          ["risks", <AlertTriangle size={14} />, "Risks", false],
        ]}
      />
      <div className="qc-grid">
        {gates.map(([label, passed, detail]) => (
          <article key={label} className={`qc-card ${passed ? "qc-card--pass" : "qc-card--hold"}`}>
            {passed ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <div>
              <h3>{label}</h3>
              <p>{detail}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="data-panel">
        <h3>Delivery rule</h3>
        <p>This run cannot be marked ready until source hashes, stage manifests, output paths, blockers, and validation status exist for each major stage.</p>
      </div>
    </>
  );
}

function SurfaceHeader({
  kicker,
  title,
  controls,
}: {
  kicker: string;
  title: string;
  controls: [string, ReactNode, string, boolean][];
}) {
  return (
    <div className="plan-toolbar">
      <div>
        <span className="kicker">{kicker}</span>
        <h2>{title}</h2>
      </div>
      <div className="view-controls">
        {controls.map(([id, icon, label, active]) => (
          <button key={id} className={active ? "is-active" : ""} type="button">
            {icon}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function OutputStack({ outputs, compact = false }: { outputs: PipelineOutput[]; compact?: boolean }) {
  return (
    <div className={`output-stack ${compact ? "output-stack--compact" : ""}`}>
      {outputs.map((output) => (
        <OutputCard
          key={output.id}
          icon={iconForOutput(output.type)}
          label={output.label}
          value={output.description}
          status={output.status}
          path={output.path}
        />
      ))}
    </div>
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
  path,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  status: string;
  path: string;
}) {
  return (
    <article className="output-card">
      <span className="output-card__icon">{icon}</span>
      <div>
        <h3>{label}</h3>
        <p>{value}</p>
        <small>{path}</small>
      </div>
      <span>{status}</span>
    </article>
  );
}

function SourceFileRow({ file }: { file: SourceFile }) {
  return (
    <article className="source-file-row">
      <FileArchive size={15} />
      <div>
        <h3>{file.name}</h3>
        <p>{formatFileSize(file.size)} · {file.extension || "file"} · {file.confidence}</p>
      </div>
    </article>
  );
}

function iconForOutput(type: PipelineOutput["type"]): ReactNode {
  switch (type) {
    case "3d":
      return <Box size={16} />;
    case "workbook":
      return <FileSpreadsheet size={16} />;
    case "graph":
      return <GitBranch size={16} />;
    case "review":
      return <ShieldCheck size={16} />;
    case "skill":
      return <Database size={16} />;
    case "manifest":
    default:
      return <Braces size={16} />;
  }
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
