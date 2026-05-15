import { FormEvent, useMemo, useRef, useState } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDotDashed,
  Hexagon,
  Plus,
  Send,
  ShieldHalf,
  Square,
  X,
  XCircle,
} from "lucide-react";
import type { ConversationTurn, PipelineRun, ToolCall } from "../types";
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const canSubmit = draft.trim().length > 0 && !streaming;
  const tokenSummary = useMemo(() => {
    const words = turns.reduce((total, turn) => total + turn.text.split(/\s+/).filter(Boolean).length, 0);
    return `${words} local words`;
  }, [turns]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || streaming) return;

    const route = routeEngineeringRequest(trimmed);
    const createdAt = new Date().toISOString();
    const run: PipelineRun = {
      id: `run-${Date.now()}`,
      title: route.title,
      request: trimmed,
      status: route.status,
      stages: route.stages,
      packages: route.packages,
      skills: route.skills,
      createdAt,
    };

    setTurns((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        text: trimmed,
        toolCalls: [],
        createdAt,
        engine: "codex",
      },
    ]);
    setDraft("");
    setStreaming(true);

    window.setTimeout(() => {
      setTurns((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: route.response,
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
    setStreaming(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function stopStreaming() {
    setStreaming(false);
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

      <form className="composer" onSubmit={submit}>
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={streaming ? "Streaming..." : "Ask Codex to process plans, data, agents, or QC"}
          rows={4}
          disabled={streaming}
        />
        <div className="composer__bar">
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
        {turn.toolCalls.length > 0 ? (
          <div className="tool-call-list">
            {turn.toolCalls.map((call) => <ToolCallRow key={call.id} call={call} />)}
          </div>
        ) : null}
      </div>
    </article>
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

