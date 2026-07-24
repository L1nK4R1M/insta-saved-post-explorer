#!/usr/bin/env python3
"""Create the minimum VibeSpec artifact set for a routed change."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import os
import sys
from datetime import date
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from vibespec_common import read_project_config  # noqa: E402


def valid_slug(value: str) -> str:
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value):
        raise argparse.ArgumentTypeError("slug must use lowercase letters, numbers, and hyphens")
    return value


def locate_vibespec(target: Path) -> Path:
    local = target / ".vibespec"
    if (local / "bundle/templates").is_dir():
        return local / "bundle"
    if (local / "templates").is_dir():
        return local
    candidates: list[Path] = []
    override = os.environ.get("VIBESPEC_HOME")
    if override:
        candidates.append(Path(override).expanduser().resolve() / "pack")
    candidates.append(Path.home() / ".vibespec" / "pack")
    candidates.append(Path(__file__).resolve().parents[1])
    for candidate in candidates:
        if (candidate / "templates").is_dir():
            return candidate
    raise FileNotFoundError("could not locate local or global VibeSpec templates")


def locate_docs_root(target: Path) -> str:
    local = target / ".vibespec"
    legacy = local / "config.json"
    if legacy.is_file():
        return json.loads(legacy.read_text(encoding="utf-8")).get("docs_root", "docs/changes")
    project = local / "project.yaml"
    if project.is_file():
        config = read_project_config(project)
        documentation = config.get("documentation", {})
        if isinstance(documentation, dict):
            return str(documentation.get("changes", "docs/changes"))
    return "docs/changes"


def replace_tokens(text: str, title: str, mode: str) -> str:
    return (text.replace("{{Change title}}", title)
                .replace("{{standard or critical}}", mode)
                .replace("{{patch, standard, critical}}", mode)
                .replace("{{YYYY-MM-DD}}", date.today().isoformat()))


def scaffold(target: Path, mode: str, slug: str, title: str | None = None) -> Path:
    vibespec = locate_vibespec(target)
    docs_root = locate_docs_root(target)
    output = target / docs_root / slug
    if output.exists():
        raise FileExistsError(f"change directory already exists: {output}")
    output.mkdir(parents=True)
    title = title or slug.replace("-", " ").title()

    files: list[tuple[str, str]] = []
    if mode == "patch":
        files = [("task.md", "task.md"), ("verification.md", "verification-report.md")]
        brief = f"# {title}\n\n**Mode:** patch\n\n## Problem\n\nDescribe the observed issue.\n\n## Intended behavior\n\nDescribe the smallest safe outcome.\n\n## Scope\n\nList touched behavior and explicit exclusions.\n"
        (output / "brief.md").write_text(brief, encoding="utf-8")
    elif mode == "standard":
        files = [
            ("spec.md", "feature-spec.md"),
            ("tasks/01-first-vertical-slice.md", "task.md"),
            ("traceability.md", "traceability-matrix.md"),
            ("verification.md", "verification-report.md"),
        ]
    else:
        files = [
            ("spec.md", "feature-spec.md"),
            ("architecture.md", "architecture.md"),
            ("risks.md", "risk-register.md"),
            ("tasks/01-first-vertical-slice.md", "task.md"),
            ("traceability.md", "traceability-matrix.md"),
            ("verification.md", "verification-report.md"),
        ]
        rollback = f"# {title} Rollback\n\n**Mode:** critical\n\n## Trigger\n\nDefine measurable rollback triggers.\n\n## Preconditions\n\nList backups, access, and owner.\n\n## Procedure\n\nProvide reversible commands and order.\n\n## Data reconciliation\n\nDescribe post-rollback validation and repair.\n"
        (output / "rollback.md").write_text(rollback, encoding="utf-8")

    for destination, template_name in files:
        destination_path = output / destination
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        template = (vibespec / "templates" / template_name).read_text(encoding="utf-8")
        destination_path.write_text(replace_tokens(template, title, mode), encoding="utf-8")

    return output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=Path, default=Path.cwd())
    parser.add_argument("--mode", choices=["patch", "standard", "critical"], required=True)
    parser.add_argument("--slug", type=valid_slug, required=True)
    parser.add_argument("--title")
    args = parser.parse_args()
    try:
        output = scaffold(args.target.resolve(), args.mode, args.slug, args.title)
    except (FileExistsError, FileNotFoundError, json.JSONDecodeError, ValueError) as exc:
        parser.error(str(exc))
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
