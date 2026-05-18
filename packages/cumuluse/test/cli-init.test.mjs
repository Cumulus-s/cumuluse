import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

const cli = new URL("../dist/cli.js", import.meta.url).pathname;

test("init creates generated files, config, and scripts without rewriting app source", () => {
  const root = mkdtempSync(join(tmpdir(), "cumuluse-vite-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify(
      {
        type: "module",
        scripts: { dev: "vite" },
        dependencies: { "@vitejs/plugin-react": "latest", react: "latest", vite: "latest" },
      },
      null,
      2,
    ),
  );
  writeFileSync(join(root, "App.tsx"), "export function App() { return null; }\n");

  execFileSync(process.execPath, [cli, "init", "--project", root, "--skip-backend"], { encoding: "utf8" });

  assert.equal(existsSync(join(root, ".cumuluse", "config.toml")), true);
  assert.equal(existsSync(join(root, "src", "cumuluse", "CumuluseProvider.tsx")), true);
  assert.equal(existsSync(join(root, "src", "cumuluse", "CumuluseDrawer.tsx")), true);
  assert.equal(existsSync(join(root, "src", "cumuluse", "cumuluse.css")), true);
  assert.match(readFileSync(join(root, "src", "cumuluse", "README.md"), "utf8"), /Detected framework: `vite-react`/);
  assert.equal(readFileSync(join(root, "App.tsx"), "utf8"), "export function App() { return null; }\n");

  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(packageJson.scripts["cumuluse:doctor"], "cumuluse doctor");
  assert.equal(packageJson.scripts["cumuluse:serve"], "cumuluse serve");
  assert.equal(packageJson.scripts["cumuluse:dev"], "cumuluse dev");
  assert.equal(packageJson.dependencies.cumuluse, "^0.1.0");
});

test("init detects Next.js and can skip package scripts", () => {
  const root = mkdtempSync(join(tmpdir(), "cumuluse-next-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ scripts: { dev: "next dev" }, dependencies: { next: "latest", react: "latest" } }, null, 2),
  );

  execFileSync(process.execPath, [cli, "init", "--project", root, "--skip-backend", "--no-package-scripts"], { encoding: "utf8" });

  assert.match(readFileSync(join(root, "src", "cumuluse", "README.md"), "utf8"), /Detected framework: `next`/);
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(packageJson.scripts["cumuluse:dev"], undefined);
  assert.equal(packageJson.dependencies.cumuluse, "^0.1.0");
});

test("init supports generic React projects", () => {
  const root = mkdtempSync(join(tmpdir(), "cumuluse-react-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ scripts: { dev: "react-scripts start" }, dependencies: { react: "latest", "react-dom": "latest" } }, null, 2),
  );

  execFileSync(process.execPath, [cli, "init", "--project", root, "--skip-backend"], { encoding: "utf8" });

  assert.match(readFileSync(join(root, "src", "cumuluse", "README.md"), "utf8"), /Detected framework: `react-generic`/);
  assert.equal(existsSync(join(root, "src", "cumuluse", "CumuluseDrawer.tsx")), true);
});
