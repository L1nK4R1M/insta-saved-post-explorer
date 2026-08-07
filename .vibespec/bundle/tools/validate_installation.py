#!/usr/bin/env python3
"""Validate a VibeSpec installation inside a repository."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

AGENT_DIRS = {
    "codex": Path(".agents/skills"),
    "claude": Path(".claude/skills"),
    "generic": Path(".vibespec/skills"),
    "hermes": Path(".agents/skills"),
}


def validate(target: Path) -> list[str]:
    errors: list[str] = []
    shared = target / ".vibespec"
    try:
        manifest = json.loads((shared / "manifest.json").read_text(encoding="utf-8"))
        config = json.loads((shared / "config.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [f"configuration: {exc}"]

    for relative in ["core", "templates", "tools/start_change.py", "tools/validate_installation.py", "tools/vibespec_common.py"]:
        if not (shared / relative).exists():
            errors.append(f"missing installed path: .vibespec/{relative}")

    for profile in config.get("profiles", []):
        if not (shared / "profiles" / f"{profile}.md").is_file():
            errors.append(f"missing selected profile: {profile}")

    for agent in config.get("agents", []):
        skill_root = target / AGENT_DIRS.get(agent, Path("__unknown__"))
        if agent not in AGENT_DIRS:
            errors.append(f"unknown configured agent: {agent}")
            continue
        for skill in manifest.get("skills", []):
            if not (skill_root / skill / "SKILL.md").is_file():
                errors.append(f"missing {agent} skill: {skill}")
        instruction = "CLAUDE.md" if agent == "claude" else "AGENTS.md"
        if not (target / instruction).is_file():
            errors.append(f"missing instruction file for {agent}: {instruction}")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=Path, default=Path.cwd())
    args = parser.parse_args()
    errors = validate(args.target.resolve())
    if errors:
        print("VibeSpec installation validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print("VibeSpec installation validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
