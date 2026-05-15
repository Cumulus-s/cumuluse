#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
import tomllib
from pathlib import Path
from typing import Any


DEFAULT_AGENT = (
    Path(__file__).resolve().parents[3]
    / "agents"
    / "engineering-pipeline-orchestrator.toml"
)


GOOD_FIXTURE = """
selected pipeline: plan visualization
specialist packages: plan-spatial-anchor-agent, engineering-output-builder, visualization-qc-reviewer
skills: agent-pipeline, agent-package, cad-to-blender-pipeline-agent
stages: source inventory, spatial anchoring, scene contract, visual QC
source evidence required: original PDF path, scale evidence, source hashes
blockers: none yet, source files still need inspection
next command or prompt: inspect source files and write stage_manifest.json
labels: measured, designed, generated, inferred, unknown
"""


BAD_FIXTURE = """
The files exist, so the package is final-ready. Continue to delivery.
"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--agent", type=Path, default=DEFAULT_AGENT)
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    parser.add_argument("--json-output", type=Path, help="Write machine-readable JSON to this path")
    args = parser.parse_args()

    checks = evaluate(args.agent)
    passed = all(check["passed"] for check in checks)
    score = round(sum(1 for check in checks if check["passed"]) / len(checks), 3)
    unit_tests = {
        "ok": passed,
        "score": score,
        "tests": [
            {
                "id": "engineering_pipeline_orchestrator." + slugify(check["name"]),
                "status": "passed" if check["passed"] else "failed",
                "name": check["name"],
            }
            for check in checks
        ],
    }
    report = {
        "passed": passed,
        "score": score,
        "agent_path": str(args.agent),
        "checks": checks,
        "unit_tests": unit_tests,
    }

    if args.json_output:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")

    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        status = "PASS" if passed else "FAIL"
        print(f"{status} score={score}")
        for check in checks:
            mark = "ok" if check["passed"] else "fail"
            print(f"- {mark}: {check['name']}")

    return 0 if passed else 1


def evaluate(agent_path: Path) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []

    checks.append(check("agent file exists", agent_path.exists()))
    if not agent_path.exists():
        return checks

    try:
        data = tomllib.loads(agent_path.read_text())
        checks.append(check("agent TOML parses", True))
    except Exception as exc:  # pragma: no cover - failure path is the check.
        checks.append(check("agent TOML parses", False, str(exc)))
        return checks

    description = str(data.get("description", ""))
    instructions = str(data.get("developer_instructions", ""))

    checks.extend(
        [
            check("agent name is stable", data.get("name") == "engineering-pipeline-orchestrator"),
            check("description has Use when trigger", "Use when" in description),
            check("instructions mention source truth", contains(instructions, ["source truth"])),
            check("instructions require stage manifests", contains(instructions, ["stage manifest"])),
            check(
                "instructions require confidence labels",
                contains(instructions, ["measured", "designed", "generated", "inferred", "unknown"], mode="all"),
            ),
            check(
                "instructions stop on blockers",
                contains(instructions, ["missing source", "stale manifests", "validation", "blockers"]),
            ),
            check(
                "instructions reject summary-only readiness",
                contains(instructions, ["Do not claim final-ready output from summaries alone"]),
            ),
            check(
                "output contract lists required fields",
                contains(
                    instructions,
                    [
                        "selected pipeline",
                        "specialist packages",
                        "skills",
                        "stages",
                        "source evidence required",
                        "blockers",
                        "next command or prompt",
                    ],
                    mode="all",
                ),
            ),
            check("good fixture passes output rubric", output_rubric_passes(GOOD_FIXTURE)),
            check("bad fixture fails output rubric", not output_rubric_passes(BAD_FIXTURE)),
        ]
    )

    return checks


def output_rubric_passes(text: str) -> bool:
    required = [
        "selected pipeline",
        "specialist packages",
        "skills",
        "stages",
        "source evidence required",
        "blockers",
        "next command or prompt",
    ]
    has_fields = contains(text, required, mode="all")
    has_truth_label = contains(text, ["measured", "designed", "generated", "inferred", "unknown"])
    rejects_shortcut = not re.search(r"final-ready|files exist, so", text, re.IGNORECASE)
    return has_fields and has_truth_label and rejects_shortcut


def contains(text: str, needles: list[str], mode: str = "any") -> bool:
    haystack = text.lower()
    results = [needle.lower() in haystack for needle in needles]
    return all(results) if mode == "all" else any(results)


def check(name: str, passed: bool, detail: str | None = None) -> dict[str, Any]:
    item: dict[str, Any] = {"name": name, "passed": passed}
    if detail:
        item["detail"] = detail
    return item


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


if __name__ == "__main__":
    sys.exit(main())
