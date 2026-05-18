import type {
  AgentEngine,
  CliDetection,
  CreateRunRequest,
  CreateRunResponse,
  PanelRun,
  PanelRunStatus,
  PipelineOutput,
  RunEvent,
  SourceFile,
  StageManifest,
} from "@local-agent-panel/contracts";
import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { basename, extname, join, resolve } from "node:path";
import { copyFile, mkdir, rename, writeFile } from "node:fs/promises";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

export interface AgentPanelServerOptions {
  storageRoot?: string;
  cwd?: string;
  maxUploadBytes?: number;
}

export interface UploadedFileBody {
  name: string;
  mimeType?: string;
  contentBase64: string;
}

interface RunProcess {
  runId: string;
  process: ChildProcess;
}

const textPreviewExtensions = new Set(["csv", "json", "txt", "md", "svg"]);
const deepIngestExtensions = new Set(["pdf", "dwg", "dxf", "ifc", "png", "jpg", "jpeg", "xlsx", "xls"]);

export class AgentPanelServer {
  readonly storageRoot: string;
  readonly cwd: string;
  readonly maxUploadBytes: number;
  private readonly runs = new Map<string, PanelRun>();
  private readonly sourceFiles = new Map<string, SourceFile>();
  private readonly events = new Map<string, RunEvent[]>();
  private readonly listeners = new Map<string, Set<ServerResponse>>();
  private readonly processes = new Map<string, RunProcess>();

  constructor(options: AgentPanelServerOptions = {}) {
    this.cwd = resolve(options.cwd ?? process.cwd());
    this.storageRoot = resolve(options.storageRoot ?? join(this.cwd, ".agent-panel"));
    this.maxUploadBytes = options.maxUploadBytes ?? 50 * 1024 * 1024;
  }

  async listen(port = 8791, host = "127.0.0.1") {
    await this.ensureStorage();
    const server = createServer((req, res) => {
      void this.route(req, res).catch((error) => {
        this.writeJSON(res, 500, { error: error instanceof Error ? error.message : String(error) });
      });
    });
    return new Promise<{ close: () => Promise<void>; url: string }>((resolvePromise) => {
      server.listen(port, host, () => {
        resolvePromise({
          url: `http://${host}:${port}`,
          close: () =>
            new Promise((closeResolve, closeReject) => {
              server.close((error) => (error ? closeReject(error) : closeResolve()));
            }),
        });
      });
    });
  }

  async detect(engine: AgentEngine): Promise<CliDetection> {
    if (engine === "claude") return this.detectClaude();
    return this.detectCodex();
  }

  async uploadFile(body: UploadedFileBody): Promise<SourceFile> {
    await this.ensureStorage();
    const originalName = basename(body.name || "upload.bin");
    const extension = extensionFor(originalName);
    const buffer = Buffer.from(body.contentBase64, "base64");
    if (buffer.byteLength > this.maxUploadBytes) {
      throw new Error(`upload_too_large: ${buffer.byteLength} bytes exceeds ${this.maxUploadBytes}`);
    }
    const id = randomUUID();
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const safeName = `${id}-${sanitizeFileName(originalName)}`;
    const storedPath = join(this.storageRoot, "inbox", safeName);
    await mkdir(join(this.storageRoot, "inbox"), { recursive: true });
    await writeFile(storedPath, buffer, { flag: "wx" });
    const createdAt = new Date().toISOString();
    const file: SourceFile = {
      id,
      name: safeName,
      originalName,
      size: buffer.byteLength,
      mimeType: body.mimeType ?? "application/octet-stream",
      extension,
      sha256,
      storedPath,
      previewText: previewFor(buffer, extension, body.mimeType),
      createdAt,
      confidence: deepIngestExtensions.has(extension) ? "needs-ingest" : "uploaded",
    };
    this.sourceFiles.set(id, file);
    return file;
  }

  async createRun(body: CreateRunRequest & { files?: UploadedFileBody[] }): Promise<CreateRunResponse> {
    await this.ensureStorage();
    const request = body.request?.trim();
    if (!request) throw new Error("request required");
    const runId = `run-${randomUUID()}`;
    const engine = body.engine ?? "codex";
    const cwd = resolve(body.cwd ?? this.cwd);
    const uploaded = body.files ? await Promise.all(body.files.map((file) => this.uploadFile(file))) : [];
    const selected = [...(body.sourceFileIds ?? []).map((id) => this.sourceFiles.get(id)).filter(isSourceFile), ...uploaded];
    const runFiles = await this.moveFilesIntoRun(runId, selected);
    const now = new Date().toISOString();
    const run: PanelRun = {
      id: runId,
      title: titleFor(request),
      request,
      engine,
      status: body.dryRun ? "blocked" : "queued",
      cwd,
      sourceFiles: runFiles,
      stages: [
        { id: "source-inventory", label: "Source inventory", owner: "local-agent-panel", status: "ready", output: "Files hashed and previewed." },
        { id: "agent-execution", label: "Agent execution", owner: engine, status: body.dryRun ? "blocked" : "queued", output: "Local CLI execution." },
        { id: "stage-manifest", label: "Stage manifest", owner: "local-agent-panel", status: "drafted", output: "Run contract and validation record." },
      ],
      packages: [],
      skills: [],
      outputs: [
        output("transcript", "Transcript", join(this.runDir(runId), "transcript.txt"), "transcript", "drafted", "Captured stdout/stderr summary."),
        output("manifest", "Stage manifest", join(this.runDir(runId), "stage_manifest.json"), "manifest", "drafted", "Source hashes, blockers, validation, and next-stage contract."),
      ],
      createdAt: now,
      updatedAt: now,
    };
    this.runs.set(runId, run);
    this.events.set(runId, []);
    this.emit(runId, "run.created", "Run created", { run });

    if (body.dryRun) {
      this.blockRun(runId, "Dry run requested. No subprocess was started.");
    } else {
      void this.startRun(runId);
    }

    await this.writeManifest(runId, body.dryRun ? ["Dry run requested."] : []);
    return {
      run,
      eventsUrl: `/v1/runs/${runId}/events`,
      manifestPath: join(this.runDir(runId), "stage_manifest.json"),
    };
  }

  async cancelRun(runId: string): Promise<PanelRun> {
    const run = this.requireRun(runId);
    const active = this.processes.get(runId);
    if (active?.process.pid) {
      terminateProcess(active.process);
    }
    this.updateRun(runId, "cancelled");
    await this.writeManifest(runId, ["Run cancelled by user."]);
    this.emit(runId, "run.cancelled", "Run cancelled");
    return this.requireRun(runId);
  }

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/v1/health") {
      this.writeJSON(res, 200, { ok: true });
      return;
    }
    if (req.method === "GET" && url.pathname === "/v1/doctor") {
      this.writeJSON(res, 200, { codex: await this.detect("codex"), claude: await this.detect("claude") });
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/files") {
      this.writeJSON(res, 201, { file: await this.uploadFile(await readJSON<UploadedFileBody>(req, this.maxUploadBytes)) });
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/runs") {
      this.writeJSON(res, 201, await this.createRun(await readJSON<CreateRunRequest>(req, this.maxUploadBytes)));
      return;
    }
    const runMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)(?:\/(events|cancel))?$/);
    if (runMatch) {
      const runId = runMatch[1];
      const action = runMatch[2];
      if (req.method === "GET" && !action) {
        this.writeJSON(res, 200, { run: this.requireRun(runId), events: this.events.get(runId) ?? [] });
        return;
      }
      if (req.method === "GET" && action === "events") {
        this.openSse(runId, res);
        return;
      }
      if (req.method === "POST" && action === "cancel") {
        this.writeJSON(res, 200, { run: await this.cancelRun(runId) });
        return;
      }
    }
    this.writeJSON(res, 404, { error: "not_found" });
  }

  private async startRun(runId: string): Promise<void> {
    const run = this.requireRun(runId);
    const detection = await this.detect(run.engine);
    if (!detection.available || !detection.supportsNonInteractive) {
      this.blockRun(runId, `${run.engine} is not ready for non-interactive execution. ${detection.error ?? "Unsupported CLI shape."}`);
      await this.writeManifest(runId, [detection.error ?? "Unsupported CLI shape."]);
      return;
    }

    const command = commandForRun(run, detection);
    this.updateRun(runId, "running");
    this.emit(runId, "run.started", `${run.engine} started`, { command: command.display });

    const child = spawn(command.argv[0], command.argv.slice(1), {
      cwd: run.cwd,
      env: safeChildEnv(),
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.processes.set(runId, { runId, process: child });
    let transcript = "";
    let stderrTail = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      transcript += chunk;
      for (const line of chunk.split(/\r?\n/).filter(Boolean)) {
        const parsed = parseAgentLine(line);
        this.emit(runId, parsed.type, parsed.message, parsed.data);
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderrTail = tail(`${stderrTail}${chunk}`, 16_384);
      this.emit(runId, "run.output", chunk, { stream: "stderr" });
    });

    child.on("error", async (error) => {
      this.processes.delete(runId);
      this.failRun(runId, error.message);
      await this.writeManifest(runId, [error.message]);
    });

    child.on("exit", async (code, signal) => {
      this.processes.delete(runId);
      await writeFile(join(this.runDir(runId), "transcript.txt"), transcript + stderrTail);
      if (this.requireRun(runId).status === "cancelled") return;
      if (code === 0) {
        this.updateRun(runId, "ready", "Process exited 0 and transcript was captured.");
        await this.writeManifest(runId, []);
        this.emit(runId, "run.ready", "Run ready", { signal });
      } else {
        const message = stderrTail.split(/\r?\n/).filter(Boolean).at(-1) ?? `exit_code=${code}`;
        this.failRun(runId, message);
        await this.writeManifest(runId, [message]);
      }
    });
  }

  private detectCodex(): CliDetection {
    const executablePath = which("codex");
    const help = spawnSync("codex", ["exec", "--help"], { encoding: "utf8", timeout: 5_000 });
    const output = `${help.stdout ?? ""}${help.stderr ?? ""}`;
    const ok = help.status === 0;
    const appServer = spawnSync("codex", ["app-server", "--help"], { encoding: "utf8", timeout: 5_000 });
    const appServerOutput = `${appServer.stdout ?? ""}${appServer.stderr ?? ""}`;
    return {
      engine: "codex",
      executablePath,
      available: Boolean(executablePath && ok),
      supportsNonInteractive: ok,
      supportsJsonStream: /json|stream/i.test(output),
      supportsMcpConfig: /mcp-config/i.test(output),
      detectedCommand: ["codex", "exec"],
      helpText: output.slice(0, 8_000),
      error: ok ? undefined : output.trim() || "codex exec --help failed",
      supportsAppServer: Boolean(executablePath && appServer.status === 0),
      appServerError: appServer.status === 0 ? undefined : appServerOutput.trim() || "codex app-server --help failed",
    };
  }

  private detectClaude(): CliDetection {
    const executablePath = which("claude");
    const help = spawnSync("claude", ["--help"], { encoding: "utf8", timeout: 5_000 });
    const output = `${help.stdout ?? ""}${help.stderr ?? ""}`;
    const ok = Boolean(executablePath && help.status === 0);
    return {
      engine: "claude",
      executablePath,
      available: ok,
      supportsNonInteractive: ok && output.includes("--print"),
      supportsJsonStream: ok && output.includes("stream-json"),
      supportsMcpConfig: ok && output.includes("--mcp-config"),
      detectedCommand: ["claude", "-p"],
      helpText: output.slice(0, 8_000),
      error: ok ? undefined : output.trim() || "claude --help failed",
      supportsAppServer: false,
      appServerError: "Claude is not a Codex app-server engine.",
    };
  }

  private async ensureStorage(): Promise<void> {
    await mkdir(this.storageRoot, { recursive: true });
    await mkdir(join(this.storageRoot, "runs"), { recursive: true });
    await mkdir(join(this.storageRoot, "inbox"), { recursive: true });
  }

  private async moveFilesIntoRun(runId: string, files: SourceFile[]): Promise<SourceFile[]> {
    const sourcesDir = join(this.runDir(runId), "sources");
    await mkdir(sourcesDir, { recursive: true });
    const moved: SourceFile[] = [];
    for (const file of files) {
      const destination = join(sourcesDir, file.name);
      if (file.storedPath !== destination) {
        await copyFile(file.storedPath, destination);
      }
      const next = { ...file, storedPath: destination };
      this.sourceFiles.set(next.id, next);
      moved.push(next);
    }
    return moved;
  }

  private async writeManifest(runId: string, blockers: string[]): Promise<void> {
    const run = this.requireRun(runId);
    const manifest: StageManifest = {
      schemaVersion: 1,
      runId,
      stageId: "agent-execution",
      sourceFiles: run.sourceFiles.map((file) => ({
        id: file.id,
        name: file.originalName,
        sha256: file.sha256,
        storedPath: file.storedPath,
        confidence: file.confidence,
      })),
      sourceHashes: Object.fromEntries(run.sourceFiles.map((file) => [file.id, file.sha256])),
      inputs: [run.request],
      outputs: run.outputs,
      toolCalls: [],
      blockers,
      validation:
        blockers.length === 0 && run.status === "ready"
          ? [{ id: "process-exit", status: "pass", message: "Process exited successfully and transcript was captured." }]
          : [{ id: "process-exit", status: "blocked", message: blockers[0] ?? "Run has not completed validation." }],
      nextStageContract: "Downstream stages must inspect source hashes, transcript, blockers, and output paths before accepting this run.",
      diagnosticsPath: join(this.runDir(runId), "diagnostics.json"),
      redactionReportPath: join(this.runDir(runId), "redaction-report.json"),
    };
    await mkdir(this.runDir(runId), { recursive: true });
    const tempPath = join(this.runDir(runId), `stage_manifest.${randomUUID()}.tmp`);
    await writeFile(tempPath, JSON.stringify(manifest, null, 2));
    await rename(tempPath, join(this.runDir(runId), "stage_manifest.json"));
  }

  private runDir(runId: string): string {
    return join(this.storageRoot, "runs", runId);
  }

  private requireRun(runId: string): PanelRun {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`run_not_found: ${runId}`);
    return run;
  }

  private updateRun(runId: string, status: PanelRunStatus, validationMessage?: string): void {
    const run = this.requireRun(runId);
    const stages = run.stages.map((stage) => {
      if (stage.id === "agent-execution") return { ...stage, status, output: validationMessage ?? stage.output };
      if (stage.id === "stage-manifest" && (status === "ready" || status === "failed" || status === "blocked" || status === "cancelled")) {
        return { ...stage, status };
      }
      return stage;
    });
    this.runs.set(runId, { ...run, status, stages, updatedAt: new Date().toISOString() });
  }

  private blockRun(runId: string, message: string): void {
    this.updateRun(runId, "blocked", message);
    this.emit(runId, "run.blocked", message);
  }

  private failRun(runId: string, message: string): void {
    this.updateRun(runId, "failed", message);
    this.emit(runId, "run.failed", message);
  }

  private emit(runId: string, type: RunEvent["type"], message: string, data?: unknown): void {
    const createdAt = new Date().toISOString();
    const id = `evt_${randomUUID()}`;
    const event: RunEvent = {
      event_id: id,
      id,
      run_id: runId,
      runId,
      type,
      source: "node-server",
      message,
      payload: data,
      data,
      raw_ref: null,
      created_at: createdAt,
      createdAt,
    };
    const list = this.events.get(runId) ?? [];
    list.push(event);
    this.events.set(runId, list);
    const payload = `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const res of this.listeners.get(runId) ?? []) {
      res.write(payload);
    }
  }

  private openSse(runId: string, res: ServerResponse): void {
    this.requireRun(runId);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const set = this.listeners.get(runId) ?? new Set<ServerResponse>();
    set.add(res);
    this.listeners.set(runId, set);
    for (const event of this.events.get(runId) ?? []) {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    }
    res.on("close", () => {
      set.delete(res);
    });
  }

  private writeJSON(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body, null, 2));
  }
}

export function createAgentPanelServer(options?: AgentPanelServerOptions): AgentPanelServer {
  return new AgentPanelServer(options);
}

async function readJSON<T>(req: IncomingMessage, maxBytes: number): Promise<T> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBytes) throw new Error("request_too_large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function commandForRun(run: PanelRun, detection: CliDetection): { argv: string[]; display: string[] } {
  const fileContext = run.sourceFiles.map((file) => `- ${file.originalName}: ${file.storedPath} sha256=${file.sha256}`).join("\n");
  const prompt = `${run.request}\n\nAttached local source files:\n${fileContext || "(none)"}`;
  if (run.engine === "claude") {
    return {
      argv: ["claude", "-p", prompt, "--output-format", "stream-json", "--include-partial-messages", "--verbose", "--session-id", randomUUID()],
      display: ["claude", "-p", "<prompt>", "--output-format", "stream-json", "--include-partial-messages", "--verbose", "--session-id", "<uuid>"],
    };
  }
  const argv = detection.supportsJsonStream ? ["codex", "exec", prompt, "--json"] : ["codex", "exec", prompt];
  return { argv, display: argv.map((part) => (part === prompt ? "<prompt>" : part)) };
}

function parseAgentLine(line: string): { type: RunEvent["type"]; message: string; data?: unknown } {
  try {
    const event = JSON.parse(line) as Record<string, unknown>;
    if (event.type === "stream_event" && typeof event.event === "object" && event.event) {
      const inner = event.event as Record<string, unknown>;
      const delta = inner.delta as Record<string, unknown> | undefined;
      if (delta?.type === "text_delta" && typeof delta.text === "string") {
        return { type: "run.output", message: delta.text, data: event };
      }
    }
    if (event.type === "result") return { type: "run.output", message: "result", data: event };
    return { type: "run.output", message: line, data: event };
  } catch {
    return { type: "run.output", message: line };
  }
}

function which(name: string): string | undefined {
  const result = spawnSync("which", [name], { encoding: "utf8", timeout: 2_000 });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function output(
  id: string,
  label: string,
  path: string,
  type: PipelineOutput["type"],
  status: PipelineOutput["status"],
  description: string,
): PipelineOutput {
  return { id, label, path, type, status, description };
}

function extensionFor(name: string): string {
  return extname(name).replace(/^\./, "").toLowerCase();
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 140) || "upload.bin";
}

function previewFor(buffer: Buffer, extension: string, mimeType?: string): string | undefined {
  const textLike = textPreviewExtensions.has(extension) || mimeType?.startsWith("text/");
  if (!textLike || buffer.byteLength > 350_000) return undefined;
  return buffer.toString("utf8").slice(0, 1_200);
}

function titleFor(request: string): string {
  const first = request.split(/\r?\n/)[0]?.trim() ?? "Local agent run";
  return first.length > 70 ? `${first.slice(0, 67)}...` : first;
}

function isSourceFile(value: SourceFile | undefined): value is SourceFile {
  return Boolean(value);
}

function safeChildEnv(): NodeJS.ProcessEnv {
  const keep = ["PATH", "HOME", "USER", "SHELL", "TMPDIR", "LANG", "LC_ALL", "TERM", "CLAUDE_CONFIG_DIR", "CODEX_HOME"];
  const env: NodeJS.ProcessEnv = {};
  for (const key of keep) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

function terminateProcess(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === "win32") {
    child.kill("SIGTERM");
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

function tail(input: string, maxBytes: number): string {
  return Buffer.byteLength(input) > maxBytes ? input.slice(-maxBytes) : input;
}
