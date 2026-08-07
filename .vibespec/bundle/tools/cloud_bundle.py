#!/usr/bin/env python3
"""Install and maintain a portable VibeSpec bundle inside a repository."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from init_project import initialize_project  # noqa: E402
from vibespec_common import (  # noqa: E402
    add_target_arguments,
    fail,
    parse_csv,
    remove_path,
    resolve_target_argument,
)
from vibespec_json import emit, envelope, error, refuse  # noqa: E402

ROOT = SCRIPT_DIR.parent
CLOUD_BEGIN = "<!-- BEGIN VIBESPEC CLOUD -->"
CLOUD_END = "<!-- END VIBESPEC CLOUD -->"
LOCK_RELATIVE = Path(".vibespec/lock.json")
PROJECT_CONFIG_RELATIVE = ".vibespec/project.yaml"
BUNDLE_ROOT = Path(".vibespec/bundle")
SUPPORTED_AGENTS = {"codex", "claude", "generic", "hermes"}
AGENT_SKILL_ROOTS = {
    "codex": Path(".agents/skills"),
    "claude": Path(".claude/skills"),
    "generic": Path(".vibespec/agent-skills"),
    "hermes": Path(".agents/skills"),
}
INSTRUCTION_FILES = {
    "codex": Path("AGENTS.md"),
    "claude": Path("CLAUDE.md"),
    "generic": Path("AGENTS.md"),
    "hermes": Path("AGENTS.md"),
}
DIFF_STATUS_ORDER = ["add", "update", "remove", "modified", "missing", "unchanged"]
DIFF_SUMMARY_KEYS = {
    "add": "added",
    "update": "updated",
    "remove": "removed",
    "modified": "modified",
    "missing": "missing",
    "unchanged": "unchanged",
}


def _manifest() -> dict[str, Any]:
    return json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _text_sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _quote(value: Path | str) -> str:
    return f'"{value}"'


def _is_unsafe_relative(relative: str) -> bool:
    """Report managed paths that could escape the target directory."""
    if not relative or relative.strip() != relative:
        return True
    if relative.startswith(("/", "\\")) or ":" in relative:
        return True
    parts = PurePosixPath(relative.replace("\\", "/")).parts
    return any(part in {"..", ""} for part in parts)


def _managed_path(target: Path, relative: str) -> Path:
    """Resolve a managed relative path and refuse anything outside the target."""
    if _is_unsafe_relative(relative):
        raise ValueError(
            "VibeSpec refused to touch an unsafe managed path.\n"
            "\n"
            "Managed path:\n"
            f"  {relative}\n"
            "\n"
            "Reason:\n"
            "  Managed paths must stay inside the target directory.\n"
            "\n"
            "Recommended action:\n"
            f"  Inspect {LOCK_RELATIVE.as_posix()} and reinstall the bundle."
        )
    return target / relative


# ---------------------------------------------------------------------------
# Refusal messages
# ---------------------------------------------------------------------------


def _refusal(
    *,
    operation: str,
    heading: str,
    paths: list[str],
    target: Path,
    reason: str,
    force_command: str,
    force_intent: str,
    risk: str,
) -> str:
    listed = "\n".join(f"  {path}" for path in paths)
    return (
        f"VibeSpec refused to {operation} the cloud bundle.\n"
        "\n"
        f"{heading}\n"
        f"{listed}\n"
        "\n"
        "Reason:\n"
        f"{reason}\n"
        "\n"
        "Recommended action:\n"
        "  Review the local changes with:\n"
        f"    vibespec cloud diff --target {_quote(target)}\n"
        "\n"
        f"{force_intent}\n"
        f"    {force_command}\n"
        "\n"
        "Risk:\n"
        f"{risk}"
    )


def _modified_files_message(operation: str, paths: list[str], target: Path) -> str:
    return _refusal(
        operation=operation,
        heading="Managed file modified:",
        paths=paths,
        target=target,
        reason=(
            "  The file content no longer matches the hash stored in\n"
            f"  {LOCK_RELATIVE.as_posix()}."
        ),
        force_command=f"vibespec cloud sync --target {_quote(target)} --force",
        force_intent="To replace the modified managed files explicitly:",
        risk=(
            "  --force discards the local modifications listed above permanently.\n"
            "  Files that VibeSpec does not manage are never touched."
        ),
    )


def _modified_blocks_message(operation: str, paths: list[str], target: Path) -> str:
    return _refusal(
        operation=operation,
        heading="Managed instruction block modified:",
        paths=paths,
        target=target,
        reason=(
            "  The managed VibeSpec block no longer matches the hash stored in\n"
            f"  {LOCK_RELATIVE.as_posix()}."
        ),
        force_command=f"vibespec cloud sync --target {_quote(target)} --force",
        force_intent="To replace the modified managed block explicitly:",
        risk=(
            "  --force discards the local modifications inside the VibeSpec markers.\n"
            "  User content outside the markers is preserved."
        ),
    )


def _existing_bundle_message(target: Path) -> str:
    return (
        "VibeSpec refused to install the cloud bundle.\n"
        "\n"
        "Existing bundle:\n"
        f"  {(target / LOCK_RELATIVE)}\n"
        "\n"
        "Reason:\n"
        "  A cloud bundle is already installed in this directory. Installing again\n"
        "  would replace managed content that the lock currently protects.\n"
        "\n"
        "Recommended action:\n"
        "  Inspect what an update would change with:\n"
        f"    vibespec cloud diff --target {_quote(target)}\n"
        "  Then update the bundle in place with:\n"
        f"    vibespec cloud sync --target {_quote(target)}\n"
        "\n"
        "To reinstall from scratch and change agents or profiles explicitly:\n"
        f"    vibespec cloud install --target {_quote(target)} --force\n"
        "\n"
        "Risk:\n"
        "  --force rewrites every managed file and instruction block, discarding\n"
        "  local modifications to managed content."
    )


def _missing_lock_message(target: Path, detail: str | None = None) -> str:
    reason = detail or "  The file does not exist, so VibeSpec cannot know what it manages here."
    return (
        "VibeSpec could not read the cloud bundle lock.\n"
        "\n"
        "Expected file:\n"
        f"  {(target / LOCK_RELATIVE)}\n"
        "\n"
        "Reason:\n"
        f"{reason}\n"
        "\n"
        "Recommended action:\n"
        "  Install a bundle in this directory with:\n"
        f"    vibespec cloud install --target {_quote(target)} --agents codex,claude"
    )


def _invalid_lock_message(target: Path, detail: str) -> str:
    return _missing_lock_message(target, f"  The file is not valid JSON: {detail}")


def _unknown_option_message(
    *, option: str, unknown: list[str], available: list[str], label: str, example: str
) -> str:
    return (
        f"VibeSpec refused the requested {label}.\n"
        "\n"
        f"Unknown {label}:\n" + "\n".join(f"  {item}" for item in unknown) + "\n"
        "\n"
        "Reason:\n"
        f"  {option} accepts a comma-separated list of values shipped with this pack.\n"
        "\n"
        f"Available {label}:\n"
        f"  {', '.join(available)}\n"
        "\n"
        "Recommended action:\n"
        f"    {example}"
    )


# ---------------------------------------------------------------------------
# Managed instruction blocks
# ---------------------------------------------------------------------------


def _extract_cloud_block(path: Path) -> str | None:
    if not path.is_file():
        return None
    text = path.read_text(encoding="utf-8")
    start = text.find(CLOUD_BEGIN)
    end = text.find(CLOUD_END)
    if start < 0 or end < start:
        return None
    end += len(CLOUD_END)
    return text[start:end]


def _managed_block(body: str) -> str:
    return f"{CLOUD_BEGIN}\n{body.strip()}\n{CLOUD_END}"


def _upsert_cloud_block(path: Path, body: str) -> None:
    block = _managed_block(body)
    existing = path.read_text(encoding="utf-8") if path.is_file() else ""
    start = existing.find(CLOUD_BEGIN)
    end = existing.find(CLOUD_END)
    if start >= 0 and end >= start:
        end += len(CLOUD_END)
        updated = existing[:start].rstrip() + "\n\n" + block + existing[end:]
    elif existing.strip():
        updated = existing.rstrip() + "\n\n" + block + "\n"
    else:
        updated = block + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(updated, encoding="utf-8")


def _remove_cloud_block(path: Path) -> None:
    if not path.is_file():
        return
    existing = path.read_text(encoding="utf-8")
    start = existing.find(CLOUD_BEGIN)
    end = existing.find(CLOUD_END)
    if start < 0 or end < start:
        return
    end += len(CLOUD_END)
    updated = (existing[:start] + existing[end:]).strip()
    if updated:
        path.write_text(updated + "\n", encoding="utf-8")
    else:
        path.unlink(missing_ok=True)


def _cloud_bootstrap(agent: str) -> str:
    if agent == "claude":
        return """# VibeSpec Pro for Claude Code Cloud

Claude Code natively loads this `CLAUDE.md` file and discovers project skills in `.claude/skills/`. The VibeSpec preflight, router, `.vibespec/project.yaml`, profiles, and document lifecycle are VibeSpec conventions and must be applied explicitly.

For every request that may change source code, tests, architecture, schemas, dependencies, CI, infrastructure, or implementation documentation:

1. Invoke `/vibespec-preflight` before planning or editing. Stop when it reports `Status: BLOCKED`.
2. Let preflight read `.vibespec/project.yaml`, call `/vibespec-routing-changes`, and name the required skills and gates.
3. Treat `.vibespec/bundle` as the active VibeSpec root.
4. Follow the Patch, Standard, or Critical route the preflight report selected.
5. Load only the required VibeSpec skills and references; do not preload the full pack.
6. Run fresh verification before claiming completion.

Never commit, push, deploy, migrate production data, rotate secrets, or perform destructive actions unless explicitly authorized. Repository-specific instructions outside this managed block override these defaults."""

    return """# VibeSpec Pro Cloud Bundle

Use the repository-managed VibeSpec skills for software changes.

Before implementation:
1. Run the `vibespec-preflight` skill before planning or editing. Stop when it reports a blocking code.
2. Read `.vibespec/project.yaml` when present.
3. Treat `.vibespec/bundle` as the active VibeSpec root.
4. Route the change as Patch, Standard, or Critical.
5. Load only the skills, profiles, and templates needed for the selected route.

Never claim completion without fresh verification evidence. Never commit, push, deploy, migrate, or run destructive operations unless explicitly authorized. Repository-specific instructions outside this managed block override these defaults."""


def _instruction_bodies(agents: list[str]) -> dict[Path, str]:
    bodies: dict[Path, str] = {}
    for agent in agents:
        relative = INSTRUCTION_FILES[agent]
        body = _cloud_bootstrap(agent)
        existing = bodies.get(relative)
        if existing is not None and existing != body:
            raise ValueError(f"agents require incompatible instruction blocks in {relative}")
        bodies[relative] = body
    return bodies


# ---------------------------------------------------------------------------
# Source inventory
# ---------------------------------------------------------------------------


def _source_files(agents: list[str], profiles: list[str]) -> dict[Path, Path]:
    manifest = _manifest()
    files: dict[Path, Path] = {}

    shared_entries = ["manifest.json"]
    for entry in shared_entries:
        files[BUNDLE_ROOT / entry] = ROOT / entry
    for directory in ["core", "templates"]:
        for source in sorted((ROOT / directory).rglob("*")):
            if source.is_file():
                files[BUNDLE_ROOT / directory / source.relative_to(ROOT / directory)] = source
    for profile in profiles:
        files[BUNDLE_ROOT / "profiles" / f"{profile}.md"] = ROOT / "profiles" / f"{profile}.md"
    # Read-side tooling is vendored because a cloud worker has no global installation. Without
    # it, the project intelligence commands would be missing in exactly the environment they
    # exist to serve. The registry is deliberately absent: it is user-global by definition and
    # meaningless inside an ephemeral worker.
    for tool in [
        "start_change.py",
        "vibespec_common.py",
        "validate_installation.py",
        "vibespec_json.py",
        "vibespec_atomic.py",
        "vibespec_git.py",
        "project_status.py",
        "evidence.py",
        "drift.py",
        # skill verify is documented as the CI entry point and gates the same way drift does.
        # Vendoring drift without it left a cloud repository able to run half of a documented
        # pair, in the one environment cloud bundles exist to serve.
        "skills.py",
        # drift delegates real bundle inspection to check_bundle_report rather than
        # re-implementing a weaker validator, so both must travel with the bundle.
        "cloud_bundle.py",
        "init_project.py",
    ]:
        files[BUNDLE_ROOT / "tools" / tool] = ROOT / "scripts" / tool

    seen_roots: set[Path] = set()
    for agent in agents:
        skill_root = AGENT_SKILL_ROOTS[agent]
        if skill_root in seen_roots:
            continue
        seen_roots.add(skill_root)
        for skill in manifest["skills"]:
            source_root = ROOT / "skills" / skill
            for source in sorted(source_root.rglob("*")):
                if source.is_file():
                    files[skill_root / skill / source.relative_to(source_root)] = source
    return files


def _validate_options(target: Path, agents: list[str], profiles: list[str]) -> None:
    manifest = _manifest()
    unknown_agents = sorted(set(agents) - SUPPORTED_AGENTS)
    unknown_profiles = sorted(set(profiles) - set(manifest.get("profiles", [])))
    if unknown_agents:
        raise ValueError(
            _unknown_option_message(
                option="--agents",
                unknown=unknown_agents,
                available=sorted(SUPPORTED_AGENTS),
                label="agents",
                example=f"vibespec cloud install --target {_quote(target)} --agents codex,claude",
            )
        )
    if unknown_profiles:
        raise ValueError(
            _unknown_option_message(
                option="--profiles",
                unknown=unknown_profiles,
                available=sorted(manifest.get("profiles", [])),
                label="profiles",
                example=f"vibespec cloud install --target {_quote(target)} --profiles web-app,backend-api",
            )
        )
    if not agents:
        raise ValueError(
            "VibeSpec refused to write the cloud bundle.\n"
            "\n"
            "Reason:\n"
            "  At least one agent is required so VibeSpec knows where to install skills.\n"
            "\n"
            f"Available agents:\n  {', '.join(sorted(SUPPORTED_AGENTS))}\n"
            "\n"
            "Recommended action:\n"
            f"    vibespec cloud install --target {_quote(target)} --agents codex,claude"
        )


def _read_lock(target: Path) -> dict[str, Any]:
    lock_path = target / LOCK_RELATIVE
    if not lock_path.is_file():
        raise FileNotFoundError(_missing_lock_message(target))
    try:
        return json.loads(lock_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(_invalid_lock_message(target, str(exc))) from exc


def _lock_files(lock: dict[str, Any]) -> dict[str, str]:
    files = lock.get("files", {})
    return {str(key): str(value) for key, value in files.items()} if isinstance(files, dict) else {}


def _lock_instruction_hashes(lock: dict[str, Any]) -> dict[str, str]:
    blocks = lock.get("instruction_blocks", {})
    return {str(key): str(value) for key, value in blocks.items()} if isinstance(blocks, dict) else {}


def _lock_agents(lock: dict[str, Any]) -> list[str]:
    return [str(agent) for agent in lock.get("agents", []) if isinstance(agent, str)]


def _lock_profiles(lock: dict[str, Any]) -> list[str]:
    return [str(profile) for profile in lock.get("profiles", []) if isinstance(profile, str)]


# ---------------------------------------------------------------------------
# Install, sync, remove
# ---------------------------------------------------------------------------


def _check_overwrite(
    target: Path,
    previous: dict[str, str],
    destinations: list[Path],
    *,
    force: bool,
    operation: str,
) -> None:
    if force:
        return
    modified: list[str] = []
    for relative in destinations:
        path = target / relative
        old_hash = previous.get(relative.as_posix())
        if path.is_symlink():
            modified.append(relative.as_posix())
        elif path.is_file() and old_hash and _sha256(path) != old_hash:
            modified.append(relative.as_posix())
        elif path.exists() and old_hash is None:
            modified.append(relative.as_posix())
    if modified:
        raise FileExistsError(_modified_files_message(operation, sorted(modified), target))


def _write_bundle(
    target: Path,
    agents: list[str],
    profiles: list[str],
    *,
    force: bool,
    operation: str = "synchronize",
) -> dict[str, Any]:
    target = target.expanduser().resolve()
    _validate_options(target, agents, profiles)
    target.mkdir(parents=True, exist_ok=True)
    lock_path = target / LOCK_RELATIVE
    previous_lock: dict[str, Any] = {}
    if lock_path.is_file():
        try:
            previous_lock = json.loads(lock_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError(_invalid_lock_message(target, str(exc))) from exc
    previous_files = _lock_files(previous_lock)

    source_files = _source_files(agents, profiles)
    old_managed = {Path(path) for path in previous_files}
    new_managed = set(source_files)
    for relative in previous_files:
        _managed_path(target, relative)
    _check_overwrite(
        target, previous_files, sorted(old_managed | new_managed), force=force, operation=operation
    )

    for relative in sorted(old_managed - new_managed):
        path = _managed_path(target, relative.as_posix())
        if path.is_file() or path.is_symlink():
            path.unlink(missing_ok=True)

    file_hashes: dict[str, str] = {}
    for relative, source in sorted(source_files.items(), key=lambda item: item[0].as_posix()):
        destination = _managed_path(target, relative.as_posix())
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.is_symlink() or destination.is_dir():
            remove_path(destination)
        shutil.copy2(source, destination)
        file_hashes[relative.as_posix()] = _sha256(destination)

    instruction_bodies = _instruction_bodies(agents)
    instruction_paths = set(instruction_bodies)
    old_instruction_paths = {Path(path) for path in previous_lock.get("instruction_files", [])}
    previous_instruction_hashes = _lock_instruction_hashes(previous_lock)
    if not force:
        changed_blocks: list[str] = []
        for relative in sorted(old_instruction_paths, key=lambda item: item.as_posix()):
            expected = previous_instruction_hashes.get(relative.as_posix())
            block = _extract_cloud_block(_managed_path(target, relative.as_posix()))
            if expected and (block is None or _text_sha256(block) != expected):
                changed_blocks.append(relative.as_posix())
        if changed_blocks:
            raise FileExistsError(_modified_blocks_message(operation, changed_blocks, target))
    for relative in sorted(old_instruction_paths - instruction_paths, key=lambda item: item.as_posix()):
        _remove_cloud_block(_managed_path(target, relative.as_posix()))
    instruction_hashes: dict[str, str] = {}
    for relative, body in sorted(instruction_bodies.items(), key=lambda item: item[0].as_posix()):
        path = _managed_path(target, relative.as_posix())
        _upsert_cloud_block(path, body)
        block = _extract_cloud_block(path)
        if block is None:
            raise OSError(f"failed to write managed instruction block: {relative}")
        instruction_hashes[relative.as_posix()] = _text_sha256(block)

    project_config = target / PROJECT_CONFIG_RELATIVE
    if not project_config.exists():
        initialize_project(target, profiles, force=False)

    manifest = _manifest()
    lock = {
        "schema_version": 1,
        "vibespec_version": manifest["version"],
        "distribution": "cloud-bundle",
        "agents": agents,
        "profiles": profiles,
        "active_root": BUNDLE_ROOT.as_posix(),
        "entrypoint_skill": manifest.get("entrypoint_skill", "vibespec-preflight"),
        "project_config": PROJECT_CONFIG_RELATIVE,
        "instruction_files": [path.as_posix() for path in sorted(instruction_paths)],
        "instruction_blocks": instruction_hashes,
        "files": file_hashes,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    lock_path.write_text(json.dumps(lock, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return lock


def install_bundle(target: Path, agents: list[str], profiles: list[str], *, force: bool = False) -> dict[str, Any]:
    resolved = target.expanduser().resolve()
    if (resolved / LOCK_RELATIVE).is_file() and not force:
        raise FileExistsError(_existing_bundle_message(resolved))
    return _write_bundle(resolved, agents, profiles, force=force, operation="install")


def sync_bundle(target: Path, *, force: bool = False) -> dict[str, Any]:
    resolved = target.expanduser().resolve()
    lock = _read_lock(resolved)
    return _write_bundle(
        resolved,
        _lock_agents(lock),
        _lock_profiles(lock),
        force=force,
        operation="synchronize",
    )


def remove_bundle(target: Path, *, force: bool = False) -> list[str]:
    target = target.expanduser().resolve()
    lock = _read_lock(target)
    preserved: list[str] = []
    for relative, expected_hash in sorted(_lock_files(lock).items()):
        path = _managed_path(target, relative)
        if not path.exists() and not path.is_symlink():
            continue
        if path.is_symlink():
            preserved.append(relative)
        elif path.is_file() and (_sha256(path) == expected_hash or force):
            path.unlink(missing_ok=True)
        else:
            preserved.append(relative)
    instruction_hashes = _lock_instruction_hashes(lock)
    for relative in lock.get("instruction_files", []):
        path = _managed_path(target, str(relative))
        block = _extract_cloud_block(path)
        expected = instruction_hashes.get(str(relative))
        if force or (block is not None and expected and _text_sha256(block) == expected):
            _remove_cloud_block(path)
        elif block is not None:
            preserved.append(str(relative))
    (target / LOCK_RELATIVE).unlink(missing_ok=True)

    for relative in [Path(".agents/skills"), Path(".claude/skills"), Path(".vibespec/agent-skills"), BUNDLE_ROOT]:
        current = target / relative
        while current != target and current.exists() and current.is_dir():
            try:
                current.rmdir()
            except OSError:
                break
            current = current.parent
    return preserved


# ---------------------------------------------------------------------------
# Diff
# ---------------------------------------------------------------------------


def _file_status(target: Path, relative: str, lock_hash: str | None, source: Path | None) -> str:
    path = target / relative
    is_file = path.is_file() and not path.is_symlink()
    current = _sha256(path) if is_file else None
    if source is not None:
        if lock_hash is None:
            return "modified" if (path.exists() or path.is_symlink()) else "add"
        if not is_file:
            return "modified" if (path.exists() or path.is_symlink()) else "missing"
        if current != lock_hash:
            return "modified"
        return "unchanged" if current == _sha256(source) else "update"
    if not (path.exists() or path.is_symlink()):
        return "unchanged"
    if is_file and current == lock_hash:
        return "remove"
    return "modified"


def _instruction_status(target: Path, relative: str, lock_hash: str | None, body: str | None) -> str:
    block = _extract_cloud_block(target / relative)
    if body is not None:
        expected = _text_sha256(_managed_block(body))
        if lock_hash is None:
            if block is None:
                return "add"
            return "unchanged" if _text_sha256(block) == expected else "modified"
        if block is None:
            return "missing"
        if _text_sha256(block) != lock_hash:
            return "modified"
        return "unchanged" if _text_sha256(block) == expected else "update"
    if block is None:
        return "unchanged"
    if lock_hash and _text_sha256(block) == lock_hash:
        return "remove"
    return "modified"


def diff_bundle(target: Path, *, include_unchanged: bool = False) -> dict[str, Any]:
    """Report what a synchronization would change without touching the project."""
    target = target.expanduser().resolve()
    manifest = _manifest()
    summary = {key: 0 for key in DIFF_SUMMARY_KEYS.values()}
    report: dict[str, Any] = {
        "target": str(target),
        "installed": False,
        "installedVersion": None,
        "sourceVersion": manifest["version"],
        "agents": [],
        "profiles": [],
        "changes": [],
        "summary": summary,
    }
    if not (target / LOCK_RELATIVE).is_file():
        return report

    lock = _read_lock(target)
    agents = _lock_agents(lock)
    profiles = _lock_profiles(lock)
    report["installed"] = True
    report["installedVersion"] = lock.get("vibespec_version")
    report["agents"] = agents
    report["profiles"] = profiles

    known_agents = [agent for agent in agents if agent in SUPPORTED_AGENTS]
    known_profiles = [profile for profile in profiles if profile in set(manifest.get("profiles", []))]
    source_by_path = {
        relative.as_posix(): source for relative, source in _source_files(known_agents, known_profiles).items()
    }
    previous_files = _lock_files(lock)

    statuses: dict[str, str] = {}
    for relative in sorted(set(previous_files) | set(source_by_path)):
        if _is_unsafe_relative(relative):
            continue
        statuses[relative] = _file_status(
            target, relative, previous_files.get(relative), source_by_path.get(relative)
        )

    bodies = {path.as_posix(): body for path, body in _instruction_bodies(known_agents).items()}
    instruction_hashes = _lock_instruction_hashes(lock)
    declared = [str(path) for path in lock.get("instruction_files", [])]
    for relative in sorted(set(declared) | set(bodies)):
        if _is_unsafe_relative(relative):
            continue
        statuses[relative] = _instruction_status(
            target, relative, instruction_hashes.get(relative), bodies.get(relative)
        )

    for status in statuses.values():
        summary[DIFF_SUMMARY_KEYS[status]] += 1
    report["changes"] = [
        {"path": relative, "status": status}
        for relative, status in sorted(
            statuses.items(), key=lambda item: (DIFF_STATUS_ORDER.index(item[1]), item[0])
        )
        if include_unchanged or status != "unchanged"
    ]
    return report


def format_diff_report(report: dict[str, Any]) -> str:
    lines = ["VibeSpec cloud bundle diff", "", "Target:", f"  {report['target']}", ""]
    if not report["installed"]:
        lines.extend(
            [
                "Installed version:",
                "  none",
                "",
                "Source version:",
                f"  {report['sourceVersion']}",
                "",
                "Status:",
                "  No VibeSpec cloud bundle is installed in this directory.",
                "",
                "Recommended action:",
                f"    vibespec cloud install --target {_quote(report['target'])} --agents codex,claude",
                "",
                "No files were changed.",
            ]
        )
        return "\n".join(lines)

    lines.extend(
        [
            "Installed version:",
            f"  {report['installedVersion'] or 'unknown'}",
            "",
            "Source version:",
            f"  {report['sourceVersion']}",
            "",
            "Agents:",
            f"  {', '.join(report['agents']) or 'none'}",
            "",
            "Profiles:",
            f"  {', '.join(report['profiles']) or 'none'}",
            "",
            "Changes:",
        ]
    )
    if report["changes"]:
        for change in report["changes"]:
            lines.append(f"  {change['status'].upper():<9} {change['path']}")
    else:
        lines.append("  none")
    summary = report["summary"]
    lines.extend(
        [
            "",
            "Summary:",
            f"  {summary['added']} added",
            f"  {summary['updated']} updated",
            f"  {summary['removed']} removed",
            f"  {summary['modified']} locally modified",
            f"  {summary['missing']} missing",
            f"  {summary['unchanged']} unchanged",
            "",
            "No files were changed.",
        ]
    )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Check
# ---------------------------------------------------------------------------


def _finding(code: str, message: str, *, path: str = "", severity: str = "error") -> dict[str, str]:
    return {"code": code, "severity": severity, "path": path, "message": message}


def _unexpected_symlinks(target: Path, roots: list[Path]) -> list[str]:
    found: list[str] = []
    for root in roots:
        base = target / root
        if not base.is_dir():
            continue
        for directory, directory_names, file_names in os.walk(base, followlinks=False):
            for name in [*directory_names, *file_names]:
                candidate = Path(directory) / name
                if candidate.is_symlink():
                    found.append(candidate.relative_to(target).as_posix())
    return sorted(set(found))


def check_bundle_report(target: Path) -> dict[str, Any]:
    """Produce the structured cloud bundle diagnosis used by `cloud check`."""
    target = target.expanduser().resolve()
    manifest = _manifest()
    findings: list[dict[str, str]] = []
    report: dict[str, Any] = {
        "target": str(target),
        "status": "failed",
        "installed": False,
        "installedVersion": None,
        "sourceVersion": manifest["version"],
        "agents": [],
        "profiles": [],
        "findings": findings,
        "summary": {"errors": 0, "warnings": 0},
    }

    def finalize() -> dict[str, Any]:
        unique: list[dict[str, str]] = []
        seen: set[tuple[str, str]] = set()
        for finding in findings:
            key = (finding["code"], finding["path"])
            if key not in seen:
                seen.add(key)
                unique.append(finding)
        findings[:] = unique
        errors = sum(1 for finding in findings if finding["severity"] == "error")
        report["summary"] = {
            "errors": errors,
            "warnings": sum(1 for finding in findings if finding["severity"] == "warning"),
        }
        report["status"] = "failed" if errors else "ok"
        return report

    lock_path = target / LOCK_RELATIVE
    if not lock_path.is_file():
        findings.append(
            _finding(
                "LOCK_MISSING",
                f"missing cloud bundle lock: {LOCK_RELATIVE.as_posix()}",
                path=LOCK_RELATIVE.as_posix(),
            )
        )
        return finalize()
    try:
        lock = json.loads(lock_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        findings.append(
            _finding(
                "LOCK_INVALID",
                f"invalid cloud bundle lock: {LOCK_RELATIVE.as_posix()}: {exc}",
                path=LOCK_RELATIVE.as_posix(),
            )
        )
        return finalize()
    if not isinstance(lock, dict):
        findings.append(
            _finding(
                "LOCK_INVALID",
                f"invalid cloud bundle lock: {LOCK_RELATIVE.as_posix()}: expected a JSON object",
                path=LOCK_RELATIVE.as_posix(),
            )
        )
        return finalize()

    report["installed"] = True
    report["installedVersion"] = lock.get("vibespec_version")
    agents = _lock_agents(lock)
    profiles = _lock_profiles(lock)
    report["agents"] = agents
    report["profiles"] = profiles

    if lock.get("distribution") != "cloud-bundle":
        findings.append(
            _finding("UNSUPPORTED_DISTRIBUTION", "unsupported distribution", path=LOCK_RELATIVE.as_posix())
        )
    if lock.get("vibespec_version") != manifest.get("version"):
        findings.append(
            _finding(
                "VERSION_MISMATCH",
                "bundle version differs from source pack version: "
                f"installed {lock.get('vibespec_version')}, source {manifest.get('version')}",
                path=LOCK_RELATIVE.as_posix(),
            )
        )
    for agent in sorted(set(agents) - SUPPORTED_AGENTS):
        findings.append(_finding("UNKNOWN_AGENT", f"unknown agent in lock: {agent}", path=LOCK_RELATIVE.as_posix()))
    for profile in sorted(set(profiles) - set(manifest.get("profiles", []))):
        findings.append(
            _finding("UNKNOWN_PROFILE", f"unknown profile in lock: {profile}", path=LOCK_RELATIVE.as_posix())
        )

    for relative, expected_hash in sorted(_lock_files(lock).items()):
        if _is_unsafe_relative(relative):
            findings.append(_finding("UNSAFE_MANAGED_PATH", f"unsafe managed path: {relative}", path=relative))
            continue
        path = target / relative
        if path.is_symlink():
            findings.append(_finding("UNEXPECTED_SYMLINK", f"unexpected symlink: {relative}", path=relative))
        elif path.is_dir():
            findings.append(
                _finding("MANAGED_FILE_IS_DIRECTORY", f"managed file is a directory: {relative}", path=relative)
            )
        elif not path.is_file():
            findings.append(_finding("MANAGED_FILE_MISSING", f"missing managed file: {relative}", path=relative))
        elif _sha256(path) != expected_hash:
            findings.append(_finding("MANAGED_FILE_MODIFIED", f"modified managed file: {relative}", path=relative))

    instruction_hashes = _lock_instruction_hashes(lock)
    for relative in sorted(str(entry) for entry in lock.get("instruction_files", [])):
        if _is_unsafe_relative(relative):
            findings.append(_finding("UNSAFE_MANAGED_PATH", f"unsafe managed path: {relative}", path=relative))
            continue
        block = _extract_cloud_block(target / relative)
        if block is None:
            findings.append(
                _finding(
                    "INSTRUCTION_BLOCK_MISSING", f"missing managed instruction block: {relative}", path=relative
                )
            )
        elif instruction_hashes.get(relative) and _text_sha256(block) != instruction_hashes[relative]:
            findings.append(
                _finding(
                    "INSTRUCTION_BLOCK_MODIFIED", f"modified managed instruction block: {relative}", path=relative
                )
            )

    entrypoint = str(lock.get("entrypoint_skill") or manifest.get("entrypoint_skill", "vibespec-preflight"))
    expected_skills = [str(skill) for skill in manifest.get("skills", [])]
    for agent in sorted(set(agents) & SUPPORTED_AGENTS):
        skill_root = AGENT_SKILL_ROOTS[agent]
        for skill in expected_skills:
            relative = (skill_root / skill / "SKILL.md").as_posix()
            if not (target / relative).is_file():
                code = "PREFLIGHT_SKILL_MISSING" if skill == entrypoint else "AGENT_SKILL_MISSING"
                findings.append(
                    _finding(code, f"missing skill for agent {agent}: {skill}", path=relative)
                )

    for profile in sorted(set(profiles) & set(manifest.get("profiles", []))):
        relative = (BUNDLE_ROOT / "profiles" / f"{profile}.md").as_posix()
        if not (target / relative).is_file():
            findings.append(_finding("PROFILE_MISSING", f"missing bundled profile: {profile}", path=relative))

    project_config = lock["project_config"] if "project_config" in lock else PROJECT_CONFIG_RELATIVE
    if project_config:
        relative = str(project_config)
        if _is_unsafe_relative(relative):
            findings.append(_finding("UNSAFE_MANAGED_PATH", f"unsafe managed path: {relative}", path=relative))
        elif not (target / relative).is_file():
            findings.append(
                _finding("PROJECT_CONFIG_MISSING", f"missing project configuration: {relative}", path=relative)
            )

    scan_roots = [BUNDLE_ROOT, *{AGENT_SKILL_ROOTS[agent] for agent in set(agents) & SUPPORTED_AGENTS}]
    for relative in _unexpected_symlinks(target, sorted(scan_roots, key=lambda item: item.as_posix())):
        findings.append(_finding("UNEXPECTED_SYMLINK", f"unexpected symlink: {relative}", path=relative))

    return finalize()


def check_bundle(target: Path) -> list[str]:
    """Return the blocking check messages, preserving the pre-2.2.2 return shape."""
    report = check_bundle_report(target)
    return [finding["message"] for finding in report["findings"] if finding["severity"] == "error"]


def format_check_report(report: dict[str, Any]) -> str:
    if report["status"] == "ok":
        lines = ["VibeSpec cloud bundle check passed.", "", "Target:", f"  {report['target']}"]
        if report["findings"]:
            lines.extend(["", "Warnings:"])
            lines.extend(f"  [{finding['code']}] {finding['message']}" for finding in report["findings"])
        return "\n".join(lines)

    lines = ["VibeSpec cloud bundle check failed.", "", "Target:", f"  {report['target']}", "", "Findings:"]
    for finding in report["findings"]:
        lines.append(f"  [{finding['code']}] {finding['message']}")
    lines.extend(["", "Recommended action:"])
    if any(finding["code"] == "LOCK_MISSING" for finding in report["findings"]):
        lines.extend(
            [
                "  Install a bundle in this directory with:",
                f"    vibespec cloud install --target {_quote(report['target'])} --agents codex,claude",
            ]
        )
    lines.extend(
        [
            "  Review what a synchronization would change with:",
            f"    vibespec cloud diff --target {_quote(report['target'])}",
            "  Repair the managed content with:",
            f"    vibespec cloud sync --target {_quote(report['target'])}",
            "",
            "Add --force only when you intend to discard the local modifications listed above.",
        ]
    )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Command line
# ---------------------------------------------------------------------------


def _resolved_target(args: argparse.Namespace) -> Path:
    return resolve_target_argument(args.target_positional, args.target_option)


def _add_json_arguments(parser: argparse.ArgumentParser) -> None:
    """Attach the two output flags, which are mutually exclusive.

    `--json` is the 2.3 envelope every other command already emits. `--json-compat` reproduces
    the 2.2 payload for one minor cycle, so a consumer that parses the old shape has a release
    to migrate in rather than a broken pipeline on upgrade.
    """
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--json", action="store_true", dest="as_json",
                       help="emit the shared VibeSpec JSON envelope")
    group.add_argument("--json-compat", action="store_true", dest="as_json_compat",
                       help="emit the 2.2 payload unchanged (deprecated, removed in 2.4)")


def _findings_at(report: dict[str, Any], severity: str) -> list[dict[str, Any]]:
    """Lift the report's own findings of one severity, without inventing any.

    Both severities are lifted. Carrying only errors left `warnings` permanently empty while
    the report underneath held warning findings, so a consumer reading the field the JSON API
    presents as first-class would conclude there were none.
    """
    return [
        error(item.get("code", "BUNDLE_FINDING"), item.get("message", ""), path=item.get("path"))
        for item in report.get("findings", [])
        if item.get("severity") == severity
    ]


def _emit_report(
    command: str,
    report: dict[str, Any],
    args: argparse.Namespace,
    *,
    human: str,
    errors: list[dict[str, Any]],
) -> None:
    """Render one report in whichever of the three forms was asked for.

    The compatibility payload is the *same object* the envelope carries under `result`, not a
    reconstruction of it: a second assembly is how the two would quietly drift apart.
    """
    if getattr(args, "as_json_compat", False):
        print(json.dumps(report, indent=2, sort_keys=True))
        return
    payload = envelope(
        command, result=report, warnings=_findings_at(report, "warning"), errors=errors
    )
    # The envelope's own success flag would blank the result on failure, and a failing check is
    # exactly when the caller needs to read it. Carry it in both cases.
    payload["result"] = report
    emit(payload, as_json=args.as_json, human=human)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    install = subparsers.add_parser("install", help="Install a cloud bundle into a project")
    add_target_arguments(install)
    install.add_argument("--agents", default="codex")
    install.add_argument("--profiles", default="")
    install.add_argument("--force", action="store_true")

    sync = subparsers.add_parser("sync", help="Update an installed cloud bundle")
    add_target_arguments(sync)
    sync.add_argument("--force", action="store_true")

    check = subparsers.add_parser("check", help="Diagnose an installed cloud bundle")
    add_target_arguments(check)
    _add_json_arguments(check)

    diff = subparsers.add_parser("diff", help="Show what a synchronization would change")
    add_target_arguments(diff)
    _add_json_arguments(diff)
    diff.add_argument("--include-unchanged", action="store_true")

    remove = subparsers.add_parser("remove", help="Remove an installed cloud bundle")
    add_target_arguments(remove)
    remove.add_argument("--force", action="store_true")

    args = parser.parse_args()
    try:
        target = _resolved_target(args)
        if args.command == "install":
            install_bundle(target, parse_csv(args.agents), parse_csv(args.profiles), force=args.force)
            print("VibeSpec cloud bundle installed.")
        elif args.command == "sync":
            sync_bundle(target, force=args.force)
            print("VibeSpec cloud bundle synchronized.")
        elif args.command == "check":
            report = check_bundle_report(target)
            failed = report["status"] != "ok"
            _emit_report(
                "cloud check", report, args,
                human=format_check_report(report),
                errors=_findings_at(report, "error") if failed else [],
            )
            return 1 if failed else 0
        elif args.command == "diff":
            report = diff_bundle(target, include_unchanged=args.include_unchanged)
            _emit_report(
                "cloud diff", report, args,
                human=format_diff_report(report),
                errors=[] if report["installed"] else [
                    error("BUNDLE_NOT_INSTALLED", "No cloud bundle is installed in this project.",
                          suggestion="Install one with: vibespec cloud install")
                ],
            )
            return 0 if report["installed"] else 1
        else:
            preserved = remove_bundle(target, force=args.force)
            if preserved:
                print("VibeSpec cloud bundle removed; modified files were preserved:")
                for path in preserved:
                    print(f"- {path}")
            else:
                print("VibeSpec cloud bundle removed.")
    except (ValueError, FileExistsError, FileNotFoundError, json.JSONDecodeError, OSError) as exc:
        # Only check and diff accept --json, so the flag is absent on the other subcommands
        # and their refusals stay prose. Reading it with getattr keeps that difference from
        # turning into an AttributeError on the failure path, which is the worst place for one.
        return refuse(
            f"cloud {args.command}",
            "CLOUD_BUNDLE_REFUSED",
            str(exc),
            as_json=getattr(args, "as_json", False),
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
