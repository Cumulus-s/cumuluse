import type {
  ApprovalRecord,
  CapabilityReport,
  CreateRunRequest,
  CreateRunResponse,
  RunEvent,
  RunStatusResponse,
  SourceFile,
  UploadFileResponse,
} from "@local-agent-panel/contracts";

export class LocalAgentPanelClient {
  readonly baseUrl: string;

  constructor(baseUrl = "http://127.0.0.1:8792") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async health(): Promise<{ ok: boolean }> {
    return this.json("/v1/health");
  }

  async capabilities(cwd?: string): Promise<CapabilityReport> {
    const query = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
    return this.json(`/v1/capabilities${query}`);
  }

  async upload(file: File): Promise<SourceFile> {
    const contentBase64 = await fileToBase64(file);
    const response = await this.json<UploadFileResponse>("/v1/uploads", {
      method: "POST",
      body: JSON.stringify({ name: file.name, mimeType: file.type || "application/octet-stream", contentBase64 }),
    });
    return response.file;
  }

  async createRun(request: CreateRunRequest): Promise<CreateRunResponse> {
    return this.json("/v1/runs", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async status(runId: string): Promise<RunStatusResponse> {
    return this.json(`/v1/runs/${encodeURIComponent(runId)}`);
  }

  async cancel(runId: string): Promise<RunStatusResponse> {
    return this.json(`/v1/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" });
  }

  async decideApproval(approvalId: string, decision: "allow_once" | "deny" | "cancel"): Promise<{ approval: ApprovalRecord }> {
    return this.json(`/v1/approvals/${encodeURIComponent(approvalId)}`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
  }

  events(runId: string): EventSource {
    return new EventSource(`${this.baseUrl}/v1/runs/${encodeURIComponent(runId)}/events.sse`);
  }

  websocket(): WebSocket {
    const url = this.baseUrl.replace(/^http/, "ws");
    return new WebSocket(`${url}/v1/ws`);
  }

  private async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${await response.text()}`);
    }
    return (await response.json()) as T;
  }
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
