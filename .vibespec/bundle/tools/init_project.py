#!/usr/bin/env python3
"""Initialize a lightweight VibeSpec configuration in a project repository."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from vibespec_common import (  # noqa: E402
    add_target_arguments,
    fail,
    parse_csv,
    resolve_target_argument,
    write_project_config,
)

ROOT = SCRIPT_DIR.parent


def _load_manifest() -> dict[str, Any]:
    candidates = [ROOT / "manifest.json", Path.home() / ".vibespec/pack/manifest.json"]
    for candidate in candidates:
        if candidate.is_file():
            return json.loads(candidate.read_text(encoding="utf-8"))
    raise FileNotFoundError("could not locate VibeSpec manifest")


def _package_json_commands(target: Path) -> tuple[str | None, dict[str, str | None]]:
    path = target / "package.json"
    if not path.is_file():
        return None, {}
    try:
        package = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None, {}
    scripts = package.get("scripts", {}) if isinstance(package.get("scripts"), dict) else {}
    package_manager = "npm"
    if (target / "pnpm-lock.yaml").exists():
        package_manager = "pnpm"
    elif (target / "yarn.lock").exists():
        package_manager = "yarn"
    elif (target / "bun.lockb").exists() or (target / "bun.lock").exists():
        package_manager = "bun"
    commands: dict[str, str | None] = {}
    for key in ["test", "lint", "typecheck", "build"]:
        if key in scripts:
            commands[key] = f"{package_manager} run {key}"
    install_command = {
        "npm": "npm install",
        "pnpm": "pnpm install",
        "yarn": "yarn install",
        "bun": "bun install",
    }[package_manager]
    commands["install"] = install_command
    name = package.get("name") if isinstance(package.get("name"), str) else None
    return name, commands


def _detect_commands(target: Path) -> tuple[str, dict[str, str | None]]:
    detected_name, commands = _package_json_commands(target)
    if commands:
        return detected_name or target.name, commands

    if (target / "Cargo.toml").is_file():
        return target.name, {
            "build": "cargo build",
            "test": "cargo test",
            "lint": "cargo clippy --all-targets --all-features -- -D warnings",
        }
    if (target / "go.mod").is_file():
        module_name = target.name
        first_line = (target / "go.mod").read_text(encoding="utf-8").splitlines()[0:1]
        if first_line and first_line[0].startswith("module "):
            module_name = first_line[0].removeprefix("module ").strip().split("/")[-1]
        return module_name, {"build": "go build ./...", "test": "go test ./...", "lint": "go vet ./..."}
    if (target / "CMakeLists.txt").is_file():
        return target.name, {
            "configure": "cmake -S . -B build",
            "build": "cmake --build build",
            "test": "ctest --test-dir build --output-on-failure",
        }
    if (target / "pyproject.toml").is_file():
        text = (target / "pyproject.toml").read_text(encoding="utf-8")
        name_match = re.search(r"(?m)^name\s*=\s*[\"']([^\"']+)[\"']", text)
        name = name_match.group(1) if name_match else target.name
        python_commands: dict[str, str | None] = {"install": "python -m pip install -e ."}
        if "pytest" in text:
            python_commands["test"] = "python -m pytest"
        if "ruff" in text:
            python_commands["lint"] = "python -m ruff check ."
        if "mypy" in text:
            python_commands["typecheck"] = "python -m mypy ."
        if "[build-system]" in text:
            python_commands["build"] = "python -m build"
        return name, python_commands
    return target.name, {}


def initialize_project(target: Path, profiles: list[str], *, force: bool = False) -> Path:
    target = target.expanduser().resolve()
    manifest = _load_manifest()
    unknown_profiles = sorted(set(profiles) - set(manifest.get("profiles", [])))
    if unknown_profiles:
        raise ValueError(f"unknown profiles: {', '.join(unknown_profiles)}")
    output = target / ".vibespec" / "project.yaml"
    if output.exists() and not force:
        raise FileExistsError(f"project configuration already exists: {output}")
    project_name, commands = _detect_commands(target)
    config: dict[str, Any] = {
        "version": 1,
        "project": {"name": project_name, "type": "application"},
        "profiles": profiles,
        "commands": commands,
        "documentation": {"root": "docs", "changes": "docs/changes"},
        "permissions": {
            "auto_commit": False,
            "auto_push": False,
            "auto_deploy": False,
            "destructive_operations": "require-confirmation",
        },
    }
    write_project_config(output, config)
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    add_target_arguments(parser)
    parser.add_argument("--profiles", default="", help="Comma-separated optional profiles")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    try:
        target = resolve_target_argument(args.target_positional, args.target_option)
        output = initialize_project(target, parse_csv(args.profiles), force=args.force)
    except (ValueError, FileExistsError, FileNotFoundError) as exc:
        return fail(str(exc))
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
