import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDotDashed,
  FileText,
  Hexagon,
  Paperclip,
  Plus,
  Send,
  ShieldHalf,
  Square,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import type { ConversationTurn, PipelineRun, SourceFile, ToolCall } from "../types";
import { sampleRequests } from "../data/seed";
import { routeEngineeringRequest } from "../lib/agentRouter";

interface CodexUsePanelProps {
  open: boolean;
  onClose: () => void;
  onRunCreated: (run: PipelineRun) => void;
}

export function CodexUsePanel({ open, onClose, onRunCreated }: CodexUsePanelProps) {
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<ConversationTurn[]>([
    {
      id: crypto.randomUUID(),
      role: "assistant",
      text: "Tell Codex what the engineer needs. I will route the request to a pipeline, specialist agent packages, and skills.",
      toolCalls: [],
      createdAt: new Date().toISOString(),
      engine: "codex",
    },
  ]);
  const [streaming, setStreaming] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<SourceFile[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = (draft.trim().length > 0 || attachedFiles.length > 0) && !streaming;
  const tokenSummary = useMemo(() => {
    const words = turns.reduce((total, turn) => total + turn.text.split(/\s+/).filter(Boolean).length, 0);
    const files = attachedFiles.length > 0 ? ` · ${attachedFiles.length} file${attachedFiles.length === 1 ? "" : "s"}` : "";
    return `${words} local words${files}`;
  }, [attachedFiles.length, turns]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = draft.trim();
    if ((!trimmed && attachedFiles.length === 0) || streaming) return;

    const requestText = trimmed || "Process uploaded files";
    const filesForRun = attachedFiles;
    const route = routeEngineeringRequest(requestText, filesForRun);
    const createdAt = new Date().toISOString();
    const run: PipelineRun = {
      id: `run-${Date.now()}`,
      title: route.title,
      request: requestText,
      sourceFiles: filesForRun,
      status: route.status,
      stages: route.stages,
      packages: route.packages,
      skills: route.skills,
      outputs: route.outputs,
      createdAt,
    };

    setTurns((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        text: requestText,
        toolCalls: [],
        files: filesForRun,
        createdAt,
        engine: "codex",
      },
    ]);
    setDraft("");
    setAttachedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setStreaming(true);

    window.setTimeout(() => {
      const fileSentence = filesForRun.length
        ? ` ${filesForRun.length} source file${filesForRun.length === 1 ? "" : "s"} will travel with the run as source evidence.`
        : "";
      setTurns((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `${route.response}${fileSentence}`,
          toolCalls: route.toolCalls,
          createdAt: new Date().toISOString(),
          engine: "codex",
        },
      ]);
      onRunCreated(run);
      setStreaming(false);
    }, 420);
  }

  function clearConversation() {
    setTurns([]);
    setDraft("");
    setAttachedFiles([]);
    setStreaming(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function stopStreaming() {
    setStreaming(false);
  }

  async function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    if (!event.target.files) return;
    await addFiles(Array.from(event.target.files));
    event.target.value = "";
  }

  async function addFiles(files: File[]) {
    const nextFiles = await Promise.all(files.map(fileToSourceFile));
    setAttachedFiles((current) => {
      const seen = new Set(current.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
      const unique = nextFiles.filter((file) => {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return [...current, ...unique];
    });
  }

  function removeFile(fileID: string) {
    setAttachedFiles((current) => current.filter((file) => file.id !== fileID));
  }

  return (
    <aside className={`codex-panel ${open ? "is-open" : ""}`} aria-label="Codex Use panel">
      <header className="codex-panel__header">
        <div className="brand-lockup" aria-label="Engineering Visualizer Codex Use">
          <span className="brand-dot" />
          <span className="brand-name">engineering</span>
          <span className="brand-chip">Codex Use</span>
        </div>
        <div className="header-actions">
          <button className="icon-button" type="button" onClick={clearConversation} aria-label="New conversation">
            <Plus size={15} />
          </button>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close Codex Use panel">
            <X size={15} />
          </button>
        </div>
      </header>

      <div className="agent-badge" aria-label="Current agent">
        <span className="agent-badge__main">
          <Hexagon size={14} />
          Codex pipeline router
        </span>
        <span>auto-mode trust</span>
      </div>

      <div className="conversation" aria-live="polite">
        {turns.length === 0 ? (
          <EmptyConversation onPick={(text) => {
            setDraft(text);
            window.setTimeout(() => inputRef.current?.focus(), 0);
          }} />
        ) : (
          turns.map((turn) => <TurnRow key={turn.id} turn={turn} />)
        )}
        {streaming ? (
          <div className="turn turn--assistant">
            <div className="turn__body">
              <span className="engine-chip"><Bot size={13} /> Codex</span>
              <p>Routing request and preparing run state<span className="cursor-mark">|</span></p>
            </div>
          </div>
        ) : null}
      </div>

      <form
        className="composer"
        onSubmit={(event) => {
          void submit(event);
        }}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          void addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <input
          ref={fileInputRef}
          className="file-input"
          type="file"
          multiple
          accept=".pdf,.dwg,.dxf,.ifc,.svg,.png,.jpg,.jpeg,.csv,.xlsx,.xls,.json,.txt,.md"
          onChange={handleFileInput}
          disabled={streaming}
          aria-label="Attach engineering source files"
        />
        {attachedFiles.length > 0 ? (
          <div className="attached-file-list" aria-label="Attached source files">
            {attachedFiles.map((file) => (
              <AttachedFileChip key={file.id} file={file} onRemove={removeFile} />
            ))}
          </div>
        ) : null}
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={streaming ? "Streaming..." : "Ask Codex what to do with plans, data, agents, or QC"}
          rows={4}
          disabled={streaming}
        />
        <div className="composer__bar">
          <button
            className="attach-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={streaming}
          >
            <Paperclip size={13} />
            Attach
          </button>
          <span className="composer__meta">
            <ShieldHalf size={13} />
            Local simulation
          </span>
          <span className="composer__meta">{tokenSummary}</span>
          {streaming ? (
            <button className="action-button action-button--danger" type="button" onClick={stopStreaming}>
              <Square size={13} />
              Stop
            </button>
          ) : (
            <button className="action-button" type="submit" disabled={!canSubmit}>
              <Send size={13} />
              Send
            </button>
          )}
        </div>
      </form>
    </aside>
  );
}

function EmptyConversation({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="empty-conversation">
      <h2>Drive engineering work from here</h2>
      <p>Choose a task or type your own request. Codex will pick the package, pipeline, and skills.</p>
      <div className="suggestions">
        {sampleRequests.map((request) => (
          <button key={request} type="button" onClick={() => onPick(request)}>
            {request}
          </button>
        ))}
      </div>
    </div>
  );
}

function TurnRow({ turn }: { turn: ConversationTurn }) {
  const isUser = turn.role === "user";
  return (
    <article className={`turn ${isUser ? "turn--user" : "turn--assistant"}`}>
      <div className="turn__body">
        {!isUser ? <span className="engine-chip"><Bot size={13} /> Codex</span> : null}
        <p>{turn.text}</p>
        {turn.files?.length ? (
          <div className="turn-file-list">
            {turn.files.map((file) => (
              <span key={file.id} className="turn-file-chip">
                <FileText size={12} />
                {file.name}
              </span>
            ))}
          </div>
        ) : null}
        {turn.toolCalls.length > 0 ? (
          <div className="tool-call-list">
            {turn.toolCalls.map((call) => <ToolCallRow key={call.id} call={call} />)}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function AttachedFileChip({ file, onRemove }: { file: SourceFile; onRemove: (fileID: string) => void }) {
  return (
    <div className="attached-file-chip">
      <FileText size={14} />
      <div>
        <strong>{file.name}</strong>
        <span>{formatFileSize(file.size)} · {file.extension || "file"} · {file.confidence}</span>
      </div>
      <button type="button" onClick={() => onRemove(file.id)} aria-label={`Remove ${file.name}`}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function ToolCallRow({ call }: { call: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const StatusIcon = call.status === "complete" ? CheckCircle2 : call.status === "failed" ? XCircle : CircleDotDashed;

  return (
    <div className="tool-call">
      <button type="button" className="tool-call__summary" onClick={() => setExpanded((value) => !value)}>
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <StatusIcon size={13} />
        <span>{call.name}</span>
      </button>
      {expanded ? (
        <div className="tool-call__detail">
          <label>input</label>
          <pre>{call.input}</pre>
          <label>output</label>
          <pre>{call.output}</pre>
        </div>
      ) : null}
    </div>
  );
}

async function fileToSourceFile(file: File): Promise<SourceFile> {
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() ?? "" : "";
  const preview = await readPreview(file);
  return {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    type: file.type,
    extension,
    lastModified: new Date(file.lastModified).toISOString(),
    preview,
    confidence: "uploaded",
  };
}

async function readPreview(file: File): Promise<string | undefined> {
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() ?? "" : "";
  const textLike = file.type.startsWith("text/") || ["csv", "json", "txt", "md", "svg"].includes(extension);
  if (!textLike || file.size > 350_000) return undefined;
  try {
    const body = await file.text();
    return body.slice(0, 600);
  } catch {
    return undefined;
  }
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
