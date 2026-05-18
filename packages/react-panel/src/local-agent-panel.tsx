import type {
  AgentEngine,
  ApprovalRecord,
  CapabilityReport,
  ConversationTurn,
  PanelRun,
  SourceFile,
  ToolCall,
} from "@local-agent-panel/contracts";
import { FormEvent, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface LocalAgentPanelProps {
  open: boolean;
  engine: AgentEngine;
  turns: ConversationTurn[];
  activeRun?: PanelRun;
  attachedFiles?: SourceFile[];
  approvals?: ApprovalRecord[];
  capability?: CapabilityReport;
  streaming?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (request: string, files: File[]) => void | Promise<void>;
  onStop?: () => void;
  onNewConversation?: () => void;
  onApprovalDecision?: (approvalId: string, decision: "allow_once" | "deny" | "cancel") => void | Promise<void>;
  renderToolCall?: (call: ToolCall) => ReactNode;
}

export function LocalAgentPanel({
  open,
  engine,
  turns,
  activeRun,
  attachedFiles = [],
  approvals = [],
  capability,
  streaming = false,
  error,
  onClose,
  onSubmit,
  onStop,
  onNewConversation,
  onApprovalDecision,
  renderToolCall,
}: LocalAgentPanelProps) {
  const [draft, setDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canSubmit = (draft.trim().length > 0 || pendingFiles.length > 0) && !streaming;
  const runStatus = activeRun ? `${activeRun.title} · ${activeRun.status}` : "No active run";
  const pendingApprovals = approvals.filter((approval) => approval.status === "pending");

  const fileSummary = useMemo(() => {
    const total = pendingFiles.length + attachedFiles.length;
    if (total === 0) return "No files";
    return `${total} file${total === 1 ? "" : "s"}`;
  }, [attachedFiles.length, pendingFiles.length]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSubmit) return;
    const request = draft.trim() || "Process uploaded files";
    const files = pendingFiles;
    setDraft("");
    setPendingFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await onSubmit(request, files);
  }

  return (
    <aside data-local-agent-panel data-open={open ? "true" : "false"} aria-label="Local agent panel">
      <header>
        <div>
          <strong>Agent Use</strong>
          <span>{engine}</span>
        </div>
        <div>
          <button type="button" onClick={onNewConversation} disabled={streaming} aria-label="New conversation">
            +
          </button>
          <button type="button" onClick={onClose} aria-label="Close panel">
            x
          </button>
        </div>
      </header>

      <section aria-label="Run status">
        <span>{runStatus}</span>
        {capability ? <span>Backend {capability.status}</span> : null}
        <span>{fileSummary}</span>
        {error ? <strong role="alert">{error}</strong> : null}
      </section>

      {pendingApprovals.length > 0 ? (
        <section aria-label="Approvals">
          {pendingApprovals.map((approval) => (
            <article key={approval.id} data-approval-kind={approval.kind}>
              <strong>{approval.kind}</strong>
              <p>{approval.reason}</p>
              {approval.command ? <code>{approval.command}</code> : null}
              <footer>
                <button type="button" onClick={() => void onApprovalDecision?.(approval.id, "allow_once")}>
                  Allow once
                </button>
                <button type="button" onClick={() => void onApprovalDecision?.(approval.id, "deny")}>
                  Deny
                </button>
                <button type="button" onClick={() => void onApprovalDecision?.(approval.id, "cancel")}>
                  Cancel
                </button>
              </footer>
            </article>
          ))}
        </section>
      ) : null}

      <section aria-live="polite">
        {turns.map((turn) => (
          <article key={turn.id} data-role={turn.role}>
            <p>{turn.text}</p>
            {turn.files.length > 0 ? (
              <div>
                {turn.files.map((file) => (
                  <span key={file.id}>{file.name}</span>
                ))}
              </div>
            ) : null}
            {turn.toolCalls.length > 0 ? (
              <div>
                {turn.toolCalls.map((call) =>
                  renderToolCall ? renderToolCall(call) : <DefaultToolCall key={call.id} call={call} />,
                )}
              </div>
            ) : null}
          </article>
        ))}
        {streaming ? <article data-role="assistant">Streaming...</article> : null}
      </section>

      <form onSubmit={(event) => void submit(event)}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.dwg,.dxf,.ifc,.svg,.png,.jpg,.jpeg,.csv,.xlsx,.xls,.json,.txt,.md"
          onChange={(event) => setPendingFiles(Array.from(event.target.files ?? []))}
          disabled={streaming}
        />
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={streaming}
          placeholder="Ask the local agent what to do"
        />
        <footer>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={streaming}>
            Attach
          </button>
          {streaming ? (
            <button type="button" onClick={onStop}>
              Stop
            </button>
          ) : (
            <button type="submit" disabled={!canSubmit}>
              Send
            </button>
          )}
        </footer>
      </form>
    </aside>
  );
}

function DefaultToolCall({ call }: { call: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>
        {call.status} · {call.name}
      </summary>
      <pre>{JSON.stringify({ input: call.input, output: call.output }, null, 2)}</pre>
    </details>
  );
}
