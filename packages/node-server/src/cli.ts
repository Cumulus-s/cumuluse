#!/usr/bin/env node
import { createAgentPanelServer } from "./index.js";

const portArg = process.argv.find((arg) => arg.startsWith("--port="));
const storageArg = process.argv.find((arg) => arg.startsWith("--storage-root="));
const cwdArg = process.argv.find((arg) => arg.startsWith("--cwd="));

const port = portArg ? Number(portArg.split("=")[1]) : 8791;
const storageRoot = storageArg?.split("=").slice(1).join("=");
const cwd = cwdArg?.split("=").slice(1).join("=");

const server = createAgentPanelServer({ storageRoot, cwd });
const handle = await server.listen(port);

process.stdout.write(`agent-panel-node listening on ${handle.url}\n`);

process.on("SIGINT", () => {
  void handle.close().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void handle.close().then(() => process.exit(0));
});
