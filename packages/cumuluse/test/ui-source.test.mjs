import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const react = readFileSync(new URL("../src/react.tsx", import.meta.url), "utf8");

test("default theme includes Cumulus brand tokens", () => {
  assert.match(css, /--cumuluse-paper: #1a1a1a/);
  assert.match(css, /--cumuluse-accent: #a44718/);
  assert.match(css, /--cumuluse-radius: 5\.5px/);
  assert.match(css, /data-cumuluse-theme="paper"/);
});

test("panel source includes local safety, approvals, retry, stop, and diagnostics states", () => {
  assert.match(react, /local-only by default/i);
  assert.match(react, /Allow once/);
  assert.match(react, /Retry/);
  assert.match(react, /Stop/);
  assert.match(react, /Diagnostics/);
});
