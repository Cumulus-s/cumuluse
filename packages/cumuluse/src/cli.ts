#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

interface InitResult {
  projectRoot: string;
  framework: Framework;
  generatedFiles: string[];
  scriptsAdded: string[];
  dependencyAdded: boolean;
  backend: "installed" | "skipped" | "failed";
  backendMessage?: string;
}

type Framework = "vite-react" | "next" | "react-generic";

const defaultPort = 8792;

async function main(argv = process.argv.slice(2)): Promise<number> {
  const command = argv[0] ?? "help";
  const rest = argv.slice(1);
  if (command === "init") return init(rest);
  if (command === "doctor") return runBackendCommand("doctor", rest);
  if (command === "serve") return runBackendCommand("serve", rest);
  if (command === "dev") return dev(rest);
  printHelp();
  return command === "help" || command === "--help" || command === "-h" ? 0 : 1;
}

function init(argv: string[]): number {
  const options = parseOptions(argv);
  const projectRoot = resolve(String(options.project ?? process.cwd()));
  const force = Boolean(options.force);
  const skipBackend = Boolean(options["skip-backend"]);
  const noPackageScripts = Boolean(options["no-package-scripts"]);
  const packageJsonPath = join(projectRoot, "package.json");
  const packageJson = readPackageJson(packageJsonPath);
  const framework = detectFramework(projectRoot, packageJson);
  const cumuluseRoot = join(projectRoot, ".cumuluse");
  const generatedRoot = join(projectRoot, "src", "cumuluse");
  const generatedFiles: string[] = [];
  mkdirSync(cumuluseRoot, { recursive: true });
  mkdirSync(generatedRoot, { recursive: true });

  generatedFiles.push(writeText(join(cumuluseRoot, "config.toml"), configToml(projectRoot), force));
  generatedFiles.push(writeText(join(generatedRoot, "CumuluseProvider.tsx"), generatedProvider(), force));
  generatedFiles.push(writeText(join(generatedRoot, "CumuluseDrawer.tsx"), generatedDrawer(), force));
  generatedFiles.push(writeText(join(generatedRoot, "cumuluse.css"), generatedCss(), force));
  generatedFiles.push(writeText(join(generatedRoot, "README.md"), generatedReadme(framework), force));

  const packageUpdate = updatePackageJson(packageJsonPath, packageJson, noPackageScripts);
  const backend = skipBackend ? { state: "skipped" as const, message: "Skipped by --skip-backend." } : installBackend(projectRoot);
  const result: InitResult = {
    projectRoot,
    framework,
    generatedFiles,
    scriptsAdded: packageUpdate.scriptsAdded,
    dependencyAdded: packageUpdate.dependencyAdded,
    backend: backend.state,
    backendMessage: backend.message,
  };
  printInitResult(result);
  return backend.state === "failed" ? 1 : 0;
}

function runBackendCommand(command: "doctor" | "serve", argv: string[]): number {
  const options = parseOptions(argv);
  const projectRoot = resolve(String(options.project ?? process.cwd()));
  const port = Number(options.port ?? defaultPort);
  const backend = backendExecutable(projectRoot);
  if (!existsSync(backend)) {
    process.stderr.write(`Cumuluse backend is not installed at ${backend}\nRun: npx cumuluse init\n`);
    return 1;
  }
  const backendArgs = [
    "--project",
    projectRoot,
    "--storage-root",
    join(projectRoot, ".cumuluse", "backend"),
    command,
  ];
  if (command === "serve") backendArgs.push("--port", String(port));
  const child = spawnSync(backend, backendArgs, { stdio: "inherit" });
  return child.status ?? 1;
}

function dev(argv: string[]): number {
  const options = parseOptions(argv);
  const projectRoot = resolve(String(options.project ?? process.cwd()));
  const port = Number(options.port ?? defaultPort);
  const backend = backendExecutable(projectRoot);
  if (!existsSync(backend)) {
    process.stderr.write(`Cumuluse backend is not installed at ${backend}\nRun: npx cumuluse init\n`);
    return 1;
  }
  const backendProcess = spawn(
    backend,
    ["--project", projectRoot, "--storage-root", join(projectRoot, ".cumuluse", "backend"), "serve", "--port", String(port)],
    { cwd: projectRoot, stdio: "inherit" },
  );
  const packageManager = detectPackageManager(projectRoot);
  const frontendProcess = spawn(packageManager, ["run", "dev"], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  const stop = () => {
    backendProcess.kill("SIGTERM");
    frontendProcess.kill("SIGTERM");
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  frontendProcess.on("exit", (code) => {
    backendProcess.kill("SIGTERM");
    process.exit(code ?? 0);
  });
  backendProcess.on("exit", (code) => {
    if (code && code !== 0) {
      frontendProcess.kill("SIGTERM");
      process.exit(code);
    }
  });
  return 0;
}

function installBackend(projectRoot: string): { state: "installed" | "failed"; message: string } {
  const python = findPython();
  if (!python) return { state: "failed", message: "Python 3.11+ was not found on PATH." };
  const venvPath = join(projectRoot, ".cumuluse", "venv");
  const pythonInVenv = process.platform === "win32" ? join(venvPath, "Scripts", "python.exe") : join(venvPath, "bin", "python");
  if (!existsSync(pythonInVenv)) {
    const venv = spawnSync(python, ["-m", "venv", venvPath], { stdio: "inherit" });
    if (venv.status !== 0) return { state: "failed", message: "Failed to create .cumuluse/venv." };
  }
  const backendSpec = process.env.CUMULUSE_BACKEND_SPEC ?? "cumuluse-backend[server,ingest]";
  const install = spawnSync(pythonInVenv, ["-m", "pip", "install", "-U", backendSpec], { stdio: "inherit" });
  if (install.status !== 0) return { state: "failed", message: `Failed to install ${backendSpec}.` };
  return { state: "installed", message: `Installed ${backendSpec} into .cumuluse/venv.` };
}

function findPython(): string | null {
  for (const candidate of ["python3", "python"]) {
    const version = spawnSync(candidate, ["-c", "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)"], {
      stdio: "ignore",
    });
    if (version.status === 0) return candidate;
  }
  return null;
}

function backendExecutable(projectRoot: string): string {
  return process.platform === "win32"
    ? join(projectRoot, ".cumuluse", "venv", "Scripts", "cumuluse-backend.exe")
    : join(projectRoot, ".cumuluse", "venv", "bin", "cumuluse-backend");
}

function updatePackageJson(
  packageJsonPath: string,
  packageJson: Record<string, unknown>,
  noPackageScripts: boolean,
): { scriptsAdded: string[]; dependencyAdded: boolean } {
  const scripts = { ...((packageJson.scripts as Record<string, string> | undefined) ?? {}) };
  const additions: Record<string, string> = {
    "cumuluse:doctor": "cumuluse doctor",
    "cumuluse:serve": "cumuluse serve",
    "cumuluse:dev": "cumuluse dev",
  };
  const added: string[] = [];
  if (!noPackageScripts) {
    for (const [key, value] of Object.entries(additions)) {
      if (!scripts[key]) {
        scripts[key] = value;
        added.push(key);
      }
    }
    packageJson.scripts = scripts;
  }
  const dependencies = { ...((packageJson.dependencies as Record<string, string> | undefined) ?? {}) };
  const devDependencies = { ...((packageJson.devDependencies as Record<string, string> | undefined) ?? {}) };
  const hasDependency = Boolean(dependencies.cumuluse || devDependencies.cumuluse);
  if (!hasDependency) dependencies.cumuluse = "^0.1.0";
  packageJson.dependencies = dependencies;
  if (Object.keys(devDependencies).length > 0) packageJson.devDependencies = devDependencies;
  if (added.length > 0 || !hasDependency) {
    writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  }
  return { scriptsAdded: added, dependencyAdded: !hasDependency };
}

function detectFramework(projectRoot: string, packageJson: Record<string, unknown>): Framework {
  const deps = {
    ...((packageJson.dependencies as Record<string, string> | undefined) ?? {}),
    ...((packageJson.devDependencies as Record<string, string> | undefined) ?? {}),
  };
  if (deps.next || existsSync(join(projectRoot, "next.config.js")) || existsSync(join(projectRoot, "next.config.mjs"))) return "next";
  if (deps.vite || existsSync(join(projectRoot, "vite.config.ts")) || existsSync(join(projectRoot, "vite.config.js"))) return "vite-react";
  return "react-generic";
}

function detectPackageManager(projectRoot: string): string {
  if (existsSync(join(projectRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(projectRoot, "yarn.lock"))) return "yarn";
  return "npm";
}

function readPackageJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) {
    return { scripts: {}, dependencies: { cumuluse: "^0.1.0" } };
  }
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function writeText(path: string, text: string, force: boolean): string {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path) && !force) return path;
  writeFileSync(path, text, "utf8");
  return path;
}

function parseOptions(argv: string[]): Record<string, string | boolean> {
  const options: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq > -1) {
      options[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      const key = arg.slice(2);
      const next = argv[index + 1];
      if (next && !next.startsWith("--")) {
        options[key] = next;
        index += 1;
      } else {
        options[key] = true;
      }
    }
  }
  return options;
}

function configToml(projectRoot: string): string {
  return [
    'name = "cumuluse"',
    'default_engine = "codex"',
    `project_root = ${JSON.stringify(projectRoot)}`,
    "",
    "[server]",
    'host = "127.0.0.1"',
    `port = ${defaultPort}`,
    "",
    "[backend]",
    'storage_root = ".cumuluse/backend"',
    'venv = ".cumuluse/venv"',
    "",
    "[safety]",
    "local_only = true",
    "allow_remote = false",
    "",
  ].join("\n");
}

function generatedProvider(): string {
  return `import { CumuluseProvider as BaseCumuluseProvider } from "cumuluse";
import "cumuluse/styles.css";
import "./cumuluse.css";
import type { ReactNode } from "react";

export function CumuluseProvider({ children }: { children: ReactNode }) {
  return (
    <BaseCumuluseProvider>
      {children}
    </BaseCumuluseProvider>
  );
}
`;
}

function generatedDrawer(): string {
  return `import { CumulusePanel } from "cumuluse";

export function CumuluseDrawer() {
  return <CumulusePanel />;
}
`;
}

function generatedCss(): string {
  return `:root {
  --cumuluse-accent: #a44718;
  --cumuluse-radius: 5.5px;
}
`;
}

function generatedReadme(framework: Framework): string {
  return `# Cumuluse

Generated by \`npx cumuluse init\`.

Detected framework: \`${framework}\`.

## Use

Start the local backend and app:

\`\`\`bash
npm run cumuluse:dev
\`\`\`

If your dev server is already running:

\`\`\`bash
npm run cumuluse:serve
\`\`\`

## Add To Your App

${snippetFor(framework)}
`;
}

function snippetFor(framework: Framework): string {
  if (framework === "next") {
    return `In your root layout, import the provider and drawer:

\`\`\`tsx
import { CumuluseProvider } from "@/cumuluse/CumuluseProvider";
import { CumuluseDrawer } from "@/cumuluse/CumuluseDrawer";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <CumuluseProvider>
          <CumuluseDrawer />
          {children}
        </CumuluseProvider>
      </body>
    </html>
  );
}
\`\`\``;
  }
  return `Wrap your app entry:

\`\`\`tsx
import { CumuluseProvider } from "./cumuluse/CumuluseProvider";
import { CumuluseDrawer } from "./cumuluse/CumuluseDrawer";

root.render(
  <CumuluseProvider>
    <CumuluseDrawer />
    <App />
  </CumuluseProvider>
);
\`\`\``;
}

function printInitResult(result: InitResult): void {
  process.stdout.write(`Cumuluse initialized in ${result.projectRoot}\n`);
  process.stdout.write(`Framework: ${result.framework}\n`);
  process.stdout.write(`Generated files:\n${result.generatedFiles.map((file) => `- ${file}`).join("\n")}\n`);
  if (result.scriptsAdded.length > 0) {
    process.stdout.write(`Scripts added: ${result.scriptsAdded.join(", ")}\n`);
  }
  if (result.dependencyAdded) {
    process.stdout.write("Dependency added: cumuluse\n");
  }
  process.stdout.write(`Backend: ${result.backend}${result.backendMessage ? ` (${result.backendMessage})` : ""}\n`);
  process.stdout.write("Next: add the snippet from src/cumuluse/README.md, then run npm run cumuluse:dev\n");
}

function printHelp(): void {
  process.stdout.write(`cumuluse

Commands:
  cumuluse init [--project <path>] [--skip-backend] [--force]
  cumuluse doctor [--project <path>]
  cumuluse serve [--project <path>] [--port 8792]
  cumuluse dev [--project <path>] [--port 8792]
`);
}

main().then((code) => {
  process.exitCode = code;
});
