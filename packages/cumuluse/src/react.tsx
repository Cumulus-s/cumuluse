import type {
  AgentEngine,
  ApprovalRecord,
  CapabilityReport,
  ConversationTurn,
  PanelRun,
  RunEvent,
  SourceFile,
} from "./contracts.js";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  CircleStop,
  FileUp,
  Loader2,
  Moon,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
  Sun,
  TerminalSquare,
  X,
} from "lucide-react";
import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CumuluseClient } from "./client.js";

export type CumuluseTheme = "ink" | "paper";

interface CumuluseContextValue {
  client: CumuluseClient;
  baseUrl: string;
  theme: CumuluseTheme;
  setTheme: (theme: CumuluseTheme) => void;
  capability: CapabilityReport | null;
  backendState: "unknown" | "ready" | "degraded" | "blocked" | "offline";
  backendError: string | null;
  refreshBackend: (cwd?: string) => Promise<void>;
  localOnlyAllowed: boolean;
  allowRemote: boolean;
  serveCommand: string;
}

export interface CumuluseProviderProps {
  children: ReactNode;
  baseUrl?: string;
  theme?: CumuluseTheme;
  allowRemote?: boolean;
  serveCommand?: string;
}

export interface CumulusePanelProps {
  defaultOpen?: boolean;
  projectCwd?: string;
  engine?: AgentEngine;
  className?: string;
  title?: string;
  allowRemote?: boolean;
}

const CumuluseContext = createContext<CumuluseContextValue | null>(null);

export function CumuluseProvider({
  children,
  baseUrl = "http://127.0.0.1:8792",
  theme = "ink",
  allowRemote = false,
  serveCommand = "npm run cumuluse:serve",
}: CumuluseProviderProps) {
  const [activeTheme, setActiveTheme] = useState<CumuluseTheme>(() => readTheme(theme));
  const [capability, setCapability] = useState<CapabilityReport | null>(null);
  const [backendState, setBackendState] = useState<CumuluseContextValue["backendState"]>("unknown");
  const [backendError, setBackendError] = useState<string | null>(null);
  const client = useMemo(() => new CumuluseClient(baseUrl), [baseUrl]);
  const localOnlyAllowed = allowRemote || isLocalBrowser();

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.cumuluseTheme = activeTheme;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("cumuluse.theme", activeTheme);
    }
  }, [activeTheme]);

  const refreshBackend = useCallback(
    async (cwd?: string) => {
      if (!localOnlyAllowed) {
        setBackendState("blocked");
        setBackendError("Cumuluse is local-only by default and is disabled on this host.");
        return;
      }
      try {
        const report = await client.capabilities(cwd);
        setCapability(report);
        setBackendState(report.status);
        setBackendError(report.blockers?.[0] ?? null);
      } catch (error) {
        setCapability(null);
        setBackendState("offline");
        setBackendError(error instanceof Error ? error.message : String(error));
      }
    },
    [client, localOnlyAllowed],
  );

  const value = useMemo<CumuluseContextValue>(
    () => ({
      client,
      baseUrl,
      theme: activeTheme,
      setTheme: setActiveTheme,
      capability,
      backendState,
      backendError,
      refreshBackend,
      localOnlyAllowed,
      allowRemote,
      serveCommand,
    }),
    [activeTheme, allowRemote, backendError, backendState, baseUrl, capability, client, localOnlyAllowed, refreshBackend, serveCommand],
  );

  return <CumuluseContext.Provider value={value}>{children}</CumuluseContext.Provider>;
}

export function useCumuluse(): CumuluseContextValue {
  const value = useContext(CumuluseContext);
  if (!value) {
    throw new Error("useCumuluse must be used inside CumuluseProvider");
  }
  return value;
}

export function CumulusePanel({
  defaultOpen = false,
  projectCwd,
  engine = "codex",
  className,
  title = "Cumuluse",
  allowRemote,
}: CumulusePanelProps) {
  const context = useCumuluse();
  const localAllowed = (allowRemote ?? context.allowRemote) ? true : context.localOnlyAllowed;
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [activeRun, setActiveRun] = useState<PanelRun | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [diagnosticsPath, setDiagnosticsPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const eventSource = useRef<EventSource | null>(null);

  useEffect(() => {
    if (open) void context.refreshBackend(projectCwd);
  }, [context.refreshBackend, open, projectCwd]);

  useEffect(() => () => eventSource.current?.close(), []);

  const canSubmit = draft.trim().length > 0 || pendingFiles.length > 0;
  const pendingApprovals = approvals.filter((approval) => approval.status === "pending");
  const backendCopy = backendStatusCopy(context.backendState);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || busy || !localAllowed) return;
    setBusy(true);
    setError(null);
    try {
      const request = draft.trim() || "Process attached files";
      const uploaded = await Promise.all(pendingFiles.map((file) => context.client.upload(file)));
      const runResponse = await context.client.createRun({
        request,
        engine,
        cwd: projectCwd,
        sourceFileIds: uploaded.map((file) => file.id),
      });
      setActiveRun(runResponse.run);
      setTurns((current) => [
        ...current,
        {
          id: `turn-${Date.now()}`,
          role: "user",
          text: request,
          files: uploaded,
          toolCalls: [],
          engine,
          createdAt: new Date().toISOString(),
        },
      ]);
      setDraft("");
      setPendingFiles([]);
      if (fileInput.current) fileInput.current.value = "";
      subscribe(runResponse.run.id);
      await refreshRun(runResponse.run.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setBusy(false);
    }
  }

  function subscribe(runId: string) {
    eventSource.current?.close();
    const source = context.client.events(runId);
    eventSource.current = source;
    source.onmessage = (event) => recordEvent(event.data, runId);
    source.addEventListener("message.delta", (event) => recordEvent((event as MessageEvent).data, runId));
    source.addEventListener("run.blocked", (event) => recordEvent((event as MessageEvent).data, runId));
    source.addEventListener("run.ready", (event) => recordEvent((event as MessageEvent).data, runId));
    source.addEventListener("approval.command.requested", (event) => recordEvent((event as MessageEvent).data, runId));
    source.onerror = () => {
      void refreshRun(runId);
      source.close();
    };
  }

  function recordEvent(raw: string, runId: string) {
    try {
      const parsed = JSON.parse(raw) as RunEvent;
      setEvents((current) => mergeEvent(current, parsed));
      void refreshRun(runId);
    } catch {
      setError("Received an unreadable backend event.");
    }
  }

  async function refreshRun(runId: string) {
    const status = await context.client.status(runId);
    setActiveRun(status.run);
    setEvents(status.events);
    setApprovals(status.approvals ?? []);
  }

  async function cancelRun() {
    if (!activeRun) return;
    const response = await context.client.cancel(activeRun.id);
    setActiveRun(response.run);
  }

  async function decideApproval(approvalId: string, decision: "allow_once" | "deny" | "cancel") {
    await context.client.decideApproval(approvalId, decision);
    if (activeRun) await refreshRun(activeRun.id);
  }

  async function loadDiagnostics() {
    if (!activeRun) return;
    const diagnostics = await context.client.diagnostics(activeRun.id);
    setDiagnosticsPath(diagnostics.bundlePath);
  }

  return (
    <div className={["cumuluse", className].filter(Boolean).join(" ")} data-open={open ? "true" : "false"}>
      <button className="cumuluse__rail" type="button" onClick={() => setOpen(true)} aria-label="Open Cumuluse">
        <span className="cumuluse__brand-dot" />
        <ChevronLeft size={16} aria-hidden="true" />
      </button>

      <aside className="cumuluse__drawer" aria-label="Cumuluse agent panel">
        <header className="cumuluse__header">
          <div className="cumuluse__brand">
            <span className="cumuluse__brand-dot" />
            <div>
              <strong>{title}</strong>
              <span>local agent panel</span>
            </div>
          </div>
          <div className="cumuluse__header-actions">
            <button className="cumuluse__icon" type="button" onClick={() => context.setTheme(context.theme === "ink" ? "paper" : "ink")} aria-label="Toggle theme">
              {context.theme === "ink" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            </button>
            <button className="cumuluse__icon" type="button" onClick={() => setOpen(false)} aria-label="Close Cumuluse">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </header>

        <section className="cumuluse__status" data-state={context.backendState}>
          <StatusIcon state={context.backendState} />
          <div>
            <strong>{backendCopy.title}</strong>
            <span>{backendCopy.detail}</span>
          </div>
          <button className="cumuluse__ghost" type="button" onClick={() => void context.refreshBackend(projectCwd)}>
            <RefreshCw size={14} aria-hidden="true" />
            Retry
          </button>
        </section>

        {!localAllowed ? (
          <section className="cumuluse__notice">
            <ShieldAlert size={16} aria-hidden="true" />
            <p>Cumuluse is local-only by default. Enable it only in local desktop or localhost environments.</p>
          </section>
        ) : context.backendState === "offline" ? (
          <section className="cumuluse__notice">
            <TerminalSquare size={16} aria-hidden="true" />
            <p>Backend is not running.</p>
            <code>{context.serveCommand}</code>
          </section>
        ) : context.backendError ? (
          <section className="cumuluse__notice">
            <AlertTriangle size={16} aria-hidden="true" />
            <p>{context.backendError}</p>
          </section>
        ) : null}

        {activeRun ? (
          <section className="cumuluse__run">
            <div>
              <span>active run</span>
              <strong>{activeRun.title}</strong>
            </div>
            <div className="cumuluse__run-actions">
              <button className="cumuluse__ghost" type="button" onClick={() => void loadDiagnostics()}>
                Diagnostics
              </button>
              <RunBadge status={activeRun.status} />
            </div>
          </section>
        ) : null}

        {diagnosticsPath ? (
          <section className="cumuluse__notice">
            <TerminalSquare size={16} aria-hidden="true" />
            <p>Diagnostics bundle ready.</p>
            <code>{diagnosticsPath}</code>
          </section>
        ) : null}

        {pendingApprovals.length > 0 ? (
          <section className="cumuluse__approvals" aria-label="Pending approvals">
            {pendingApprovals.map((approval) => (
              <article key={approval.id}>
                <strong>{approval.kind.replace("_", " ")}</strong>
                <p>{approval.reason}</p>
                {approval.command ? <code>{approval.command}</code> : null}
                <footer>
                  <button type="button" onClick={() => void decideApproval(approval.id, "allow_once")}>
                    Allow once
                  </button>
                  <button type="button" onClick={() => void decideApproval(approval.id, "deny")}>
                    Deny
                  </button>
                  <button type="button" onClick={() => void decideApproval(approval.id, "cancel")}>
                    Cancel
                  </button>
                </footer>
              </article>
            ))}
          </section>
        ) : null}

        <section className="cumuluse__turns" aria-live="polite">
          {turns.length === 0 ? (
            <div className="cumuluse__empty">
              <TerminalSquare size={22} aria-hidden="true" />
              <strong>Ask Codex or Claude Code to work locally.</strong>
              <span>Attach files, stream a run, approve actions, and keep diagnostics close.</span>
            </div>
          ) : (
            turns.map((turn) => (
              <article key={turn.id} className="cumuluse__turn" data-role={turn.role}>
                <p>{turn.text}</p>
                {turn.files.length > 0 ? (
                  <div className="cumuluse__chips">
                    {turn.files.map((file) => (
                      <span key={file.id}>{file.originalName}</span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))
          )}
          {events.length > 0 ? (
            <details className="cumuluse__events">
              <summary>Run events ({events.length})</summary>
              {events.slice(-8).map((event) => (
                <div key={event.event_id} className="cumuluse__event">
                  <span>{event.type}</span>
                  <p>{event.message}</p>
                </div>
              ))}
            </details>
          ) : null}
        </section>

        {error ? <p className="cumuluse__error">{error}</p> : null}

        <form className="cumuluse__composer" onSubmit={(event) => void submit(event)}>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".pdf,.dwg,.dxf,.ifc,.svg,.png,.jpg,.jpeg,.csv,.xlsx,.xls,.json,.txt,.md"
            onChange={(event) => setPendingFiles(Array.from(event.currentTarget.files ?? []))}
          />
          {pendingFiles.length > 0 ? (
            <div className="cumuluse__chips">
              {pendingFiles.map((file) => (
                <span key={`${file.name}-${file.lastModified}`}>{file.name}</span>
              ))}
            </div>
          ) : null}
          <textarea value={draft} onChange={(event) => setDraft(event.currentTarget.value)} placeholder="Ask the local agent what to do..." />
          <footer>
            <button className="cumuluse__ghost" type="button" onClick={() => fileInput.current?.click()}>
              <FileUp size={15} aria-hidden="true" />
              Attach
            </button>
            {activeRun?.status === "running" || busy ? (
              <button className="cumuluse__danger" type="button" onClick={() => void cancelRun()}>
                <CircleStop size={15} aria-hidden="true" />
                Stop
              </button>
            ) : (
              <button className="cumuluse__send" type="submit" disabled={!canSubmit || !localAllowed}>
                {busy ? <Loader2 size={15} aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
                Send
              </button>
            )}
          </footer>
        </form>
      </aside>
    </div>
  );
}

function StatusIcon({ state }: { state: CumuluseContextValue["backendState"] }) {
  if (state === "ready") return <CheckCircle2 size={18} aria-hidden="true" />;
  if (state === "offline" || state === "blocked") return <AlertTriangle size={18} aria-hidden="true" />;
  if (state === "degraded") return <ShieldAlert size={18} aria-hidden="true" />;
  return <Loader2 size={18} aria-hidden="true" />;
}

function RunBadge({ status }: { status: PanelRun["status"] }) {
  return <span className="cumuluse__badge" data-status={status}>{status.replaceAll("_", " ")}</span>;
}

function backendStatusCopy(state: CumuluseContextValue["backendState"]) {
  if (state === "ready") return { title: "Backend ready", detail: "Codex app-server bridge is available." };
  if (state === "degraded") return { title: "Backend degraded", detail: "Using fallback behavior where available." };
  if (state === "blocked") return { title: "Backend blocked", detail: "Doctor found a local configuration issue." };
  if (state === "offline") return { title: "Backend offline", detail: "Start the local backend and retry." };
  return { title: "Checking backend", detail: "Cumuluse doctor has not completed yet." };
}

function mergeEvent(events: RunEvent[], next: RunEvent): RunEvent[] {
  if (events.some((event) => event.event_id === next.event_id)) return events;
  return [...events, next];
}

function isLocalBrowser(): boolean {
  if (typeof window === "undefined") return true;
  return ["localhost", "127.0.0.1", "::1", ""].includes(window.location.hostname);
}

function readTheme(fallback: CumuluseTheme): CumuluseTheme {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem("cumuluse.theme") === "paper" ? "paper" : fallback;
}
