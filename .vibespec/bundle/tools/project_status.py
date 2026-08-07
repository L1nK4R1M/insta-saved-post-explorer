#!/usr/bin/env python3
"""The machine-readable project lifecycle contract, `.vibespec/status.json`.

This file holds *declared* state: what a human or an agent asserts about the project. Git,
the filesystem, and the cloud lock hold *observed* facts. The two are never merged
silently. Validation here reads the declared document alone and never inspects Git, so a
project can be validated on a machine that has neither Git nor the repository history.

The document is project-owned. It is never recorded in `.vibespec/lock.json` and never
written by `cloud install` or `cloud sync`; a distribution tool has no business inventing
a business phase.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from vibespec_atomic import read_json, write_json  # noqa: E402
from vibespec_common import (  # noqa: E402
    add_target_arguments,
    fail,
    read_project_config,
    resolve_target_argument,
)
from vibespec_git import branch_exists, observe_repository  # noqa: E402
from vibespec_json import emit, envelope, error, refuse  # noqa: E402

SCHEMA_VERSION = 1
STATUS_RELATIVE = Path(".vibespec/status.json")
PROJECT_CONFIG_RELATIVE = Path(".vibespec/project.yaml")
LOCK_RELATIVE = Path(".vibespec/lock.json")

PHASE_STATES = ("planned", "active", "blocked", "completed", "paused", "cancelled")
# Milestones progress rather than activate, so they carry `in_progress` where a phase
# carries `active`. Everything else is deliberately identical to the phase vocabulary.
MILESTONE_STATES = ("planned", "in_progress", "blocked", "completed", "paused", "cancelled")
CHANGE_STATES = (
    "proposed",
    "clarifying",
    "specified",
    "ready",
    "implementing",
    "verifying",
    "reviewing",
    "blocked",
    "completed",
    "cancelled",
)
GATE_STATES = ("not_required", "pending", "passed", "failed", "blocked", "unknown")
GATE_NAMES = ("preflight", "specification", "architecture", "tests", "review", "documentation")
ROUTES = ("patch", "standard", "critical")
NEXT_ACTION_TYPES = (
    "blocked",
    "change_selection",
    "preflight",
    "clarification",
    "specification",
    "architecture",
    "implementation",
    "tests",
    "verification",
    "review",
    "documentation",
    "merge_ready",
)

SLUG = re.compile(r"\A[a-z0-9]+(?:-[a-z0-9]+)*\Z")
TIMESTAMP = re.compile(r"\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\Z")

# Gate states that still represent outstanding work when a change claims to be finished.
_UNSETTLED_GATES = ("pending", "failed", "blocked", "unknown")


# ---------------------------------------------------------------------------
# Validation. Pure: no IO, no Git, no clock.
# ---------------------------------------------------------------------------


def _choice_suggestion(choices: tuple[str, ...]) -> str:
    return "Use one of: " + ", ".join(choices)


def _require_mapping(value: Any, path: str, errors: list[dict[str, str]]) -> bool:
    if not isinstance(value, dict):
        errors.append(
            error(
                "STATUS_INVALID_TYPE",
                f"Expected an object, found {type(value).__name__}",
                path=path,
                suggestion="Provide a JSON object at this position",
            )
        )
        return False
    return True


def _require_field(container: dict[str, Any], key: str, path: str, errors: list[dict[str, str]]) -> bool:
    if key not in container:
        errors.append(
            error(
                "STATUS_MISSING_FIELD",
                f"Missing required field: {key}",
                path=path,
                suggestion=f"Add {key} to the document",
            )
        )
        return False
    return True


def _check_choice(
    value: Any,
    choices: tuple[str, ...],
    code: str,
    path: str,
    errors: list[dict[str, str]],
) -> None:
    if not isinstance(value, str):
        errors.append(
            error("STATUS_INVALID_TYPE", f"Expected a string, found {type(value).__name__}", path=path)
        )
        return
    if value not in choices:
        errors.append(
            error(code, f"Unsupported value: {value}", path=path, suggestion=_choice_suggestion(choices))
        )


def _validate_project(document: dict[str, Any], errors: list[dict[str, str]]) -> None:
    if not _require_field(document, "project", "$.project", errors):
        return
    project = document["project"]
    if not _require_mapping(project, "$.project", errors):
        return
    if _require_field(project, "id", "$.project.id", errors):
        identifier = project["id"]
        if not isinstance(identifier, str):
            errors.append(error("STATUS_INVALID_TYPE", "Expected a string", path="$.project.id"))
        elif not SLUG.match(identifier):
            errors.append(
                error(
                    "STATUS_INVALID_PROJECT_ID",
                    f"Project id is not a slug: {identifier}",
                    path="$.project.id",
                    suggestion="Use lowercase letters, digits, and single hyphens",
                )
            )
    if _require_field(project, "name", "$.project.name", errors) and not isinstance(project["name"], str):
        errors.append(error("STATUS_INVALID_TYPE", "Expected a string", path="$.project.name"))


def _validate_vibespec(document: dict[str, Any], errors: list[dict[str, str]]) -> None:
    if not _require_field(document, "vibespec", "$.vibespec", errors):
        return
    section = document["vibespec"]
    if not _require_mapping(section, "$.vibespec", errors):
        return
    for key in ("version", "distribution"):
        if _require_field(section, key, f"$.vibespec.{key}", errors) and not isinstance(section[key], str):
            errors.append(error("STATUS_INVALID_TYPE", "Expected a string", path=f"$.vibespec.{key}"))


def _validate_lifecycle(document: dict[str, Any], errors: list[dict[str, str]]) -> None:
    if not _require_field(document, "lifecycle", "$.lifecycle", errors):
        return
    lifecycle = document["lifecycle"]
    if not _require_mapping(lifecycle, "$.lifecycle", errors):
        return

    if _require_field(lifecycle, "phase", "$.lifecycle.phase", errors):
        phase = lifecycle["phase"]
        if _require_mapping(phase, "$.lifecycle.phase", errors):
            for key in ("id", "name"):
                _require_field(phase, key, f"$.lifecycle.phase.{key}", errors)
            if _require_field(phase, "status", "$.lifecycle.phase.status", errors):
                _check_choice(
                    phase["status"],
                    PHASE_STATES,
                    "STATUS_INVALID_PHASE_VALUE",
                    "$.lifecycle.phase.status",
                    errors,
                )

    milestone = lifecycle.get("milestone")
    if milestone is not None and _require_mapping(milestone, "$.lifecycle.milestone", errors):
        for key in ("id", "name"):
            _require_field(milestone, key, f"$.lifecycle.milestone.{key}", errors)
        if _require_field(milestone, "status", "$.lifecycle.milestone.status", errors):
            _check_choice(
                milestone["status"],
                MILESTONE_STATES,
                "STATUS_INVALID_PHASE_VALUE",
                "$.lifecycle.milestone.status",
                errors,
            )


def _validate_active_change(document: dict[str, Any], errors: list[dict[str, str]]) -> None:
    if "activeChange" not in document:
        errors.append(
            error(
                "STATUS_MISSING_FIELD",
                "Missing required field: activeChange",
                path="$.activeChange",
                suggestion="Use null when no change is currently open",
            )
        )
        return
    change = document["activeChange"]
    if change is None:
        return
    if not _require_mapping(change, "$.activeChange", errors):
        return

    for key in ("id", "title"):
        if _require_field(change, key, f"$.activeChange.{key}", errors) and not isinstance(change[key], str):
            errors.append(error("STATUS_INVALID_TYPE", "Expected a string", path=f"$.activeChange.{key}"))
    if _require_field(change, "route", "$.activeChange.route", errors):
        _check_choice(change["route"], ROUTES, "STATUS_INVALID_ROUTE_VALUE", "$.activeChange.route", errors)
    if _require_field(change, "status", "$.activeChange.status", errors):
        _check_choice(
            change["status"], CHANGE_STATES, "STATUS_INVALID_CHANGE_VALUE", "$.activeChange.status", errors
        )
    # A project without Git legitimately has no branch, so null is valid for both.
    for key in ("branch", "baseBranch"):
        value = change.get(key)
        if value is not None and not isinstance(value, str):
            errors.append(error("STATUS_INVALID_TYPE", "Expected a string or null", path=f"$.activeChange.{key}"))
    for key in ("issue", "pullRequest"):
        value = change.get(key)
        if value is not None and not isinstance(value, int):
            errors.append(
                error("STATUS_INVALID_TYPE", "Expected an integer or null", path=f"$.activeChange.{key}")
            )


def _validate_gates(document: dict[str, Any], errors: list[dict[str, str]]) -> None:
    if not _require_field(document, "gates", "$.gates", errors):
        return
    gates = document["gates"]
    if not _require_mapping(gates, "$.gates", errors):
        return
    for name in sorted(gates):
        path = f"$.gates.{name}"
        if name not in GATE_NAMES:
            errors.append(
                error(
                    "STATUS_UNKNOWN_GATE",
                    f"Unknown gate: {name}",
                    path=path,
                    suggestion=_choice_suggestion(GATE_NAMES),
                )
            )
            continue
        _check_choice(gates[name], GATE_STATES, "STATUS_INVALID_GATE_VALUE", path, errors)
    for name in GATE_NAMES:
        if name not in gates:
            errors.append(
                error(
                    "STATUS_MISSING_FIELD",
                    f"Missing required gate: {name}",
                    path=f"$.gates.{name}",
                    suggestion="Use unknown when the gate state has not been established",
                )
            )


def _validate_workflow(document: dict[str, Any], errors: list[dict[str, str]]) -> None:
    if not _require_field(document, "workflow", "$.workflow", errors):
        return
    workflow = document["workflow"]
    if not _require_mapping(workflow, "$.workflow", errors):
        return
    for key in ("stopAfterMerge", "allowParallelChanges"):
        if _require_field(workflow, key, f"$.workflow.{key}", errors) and not isinstance(workflow[key], bool):
            errors.append(error("STATUS_INVALID_TYPE", "Expected a boolean", path=f"$.workflow.{key}"))


def _validate_next_action(document: dict[str, Any], errors: list[dict[str, str]]) -> None:
    if not _require_field(document, "nextAction", "$.nextAction", errors):
        return
    action = document["nextAction"]
    if not _require_mapping(action, "$.nextAction", errors):
        return
    for key in ("type", "description"):
        if _require_field(action, key, f"$.nextAction.{key}", errors) and not isinstance(action[key], str):
            errors.append(error("STATUS_INVALID_TYPE", "Expected a string", path=f"$.nextAction.{key}"))


def _validate_contradictions(document: dict[str, Any], errors: list[dict[str, str]]) -> None:
    """Catch states that are individually legal but cannot both be true."""
    change = document.get("activeChange")
    gates = document.get("gates")
    if not isinstance(change, dict) or not isinstance(gates, dict):
        return
    if change.get("status") != "completed":
        return
    outstanding = sorted(
        name for name in GATE_NAMES if gates.get(name) in _UNSETTLED_GATES
    )
    if outstanding:
        errors.append(
            error(
                "STATUS_CONTRADICTORY_STATE",
                "The change is completed while these gates are unsettled: " + ", ".join(outstanding),
                path="$.activeChange.status",
                suggestion="Settle the gates, or move the change back to a state that matches them",
            )
        )


def validate_status(document: Any) -> list[dict[str, str]]:
    """Validate the declared document. Never reads Git, the filesystem, or the clock."""
    errors: list[dict[str, str]] = []

    if not isinstance(document, dict):
        return [error("STATUS_INVALID_TYPE", "The status document must be a JSON object", path="$")]

    if _require_field(document, "schemaVersion", "$.schemaVersion", errors):
        version = document["schemaVersion"]
        if version != SCHEMA_VERSION:
            errors.append(
                error(
                    "STATUS_UNSUPPORTED_SCHEMA_VERSION",
                    f"Unsupported schemaVersion: {version}",
                    path="$.schemaVersion",
                    suggestion=f"This VibeSpec understands schemaVersion {SCHEMA_VERSION}",
                )
            )

    _validate_project(document, errors)
    _validate_vibespec(document, errors)
    _validate_lifecycle(document, errors)
    _validate_active_change(document, errors)
    _validate_workflow(document, errors)
    _validate_gates(document, errors)
    _validate_next_action(document, errors)

    if _require_field(document, "updatedAt", "$.updatedAt", errors):
        stamp = document["updatedAt"]
        if not isinstance(stamp, str) or not TIMESTAMP.match(stamp):
            errors.append(
                error(
                    "STATUS_INVALID_TIMESTAMP",
                    f"Not an ISO 8601 UTC timestamp: {stamp}",
                    path="$.updatedAt",
                    suggestion="Use a value such as 2026-07-30T00:00:00Z",
                )
            )

    _validate_contradictions(document, errors)

    # Deterministic ordering: two runs on one document produce identical output.
    return sorted(errors, key=lambda item: (item.get("path", ""), item["code"]))


# ---------------------------------------------------------------------------
# Next action. Pure: a decision table over the declared document.
# ---------------------------------------------------------------------------


def next_action(document: dict[str, Any]) -> dict[str, str]:
    """Return the next authorized action.

    The precedence order is the table in docs/project-status.md. First match wins, and
    every row is covered by tests/test_status_next.py. This function reads; it decides
    nothing about the filesystem and changes nothing.
    """
    gates = document.get("gates") or {}
    change = document.get("activeChange")
    change_status = change.get("status") if isinstance(change, dict) else None
    route = change.get("route") if isinstance(change, dict) else None

    failed = sorted(name for name in GATE_NAMES if gates.get(name) == "failed")
    if failed:
        return {
            "type": "blocked",
            "description": "Resolve the failed gate: " + ", ".join(failed),
        }

    stalled = sorted(name for name in GATE_NAMES if gates.get(name) == "blocked")
    if stalled or change_status == "blocked":
        detail = ", ".join(stalled) if stalled else "the active change"
        return {"type": "blocked", "description": f"Resolve the blocker on {detail}"}

    if change is None:
        return {"type": "change_selection", "description": "Select or declare the next change"}

    if change_status in ("completed", "cancelled"):
        return {"type": "change_selection", "description": "Select or declare the next change"}

    if gates.get("preflight") != "passed":
        return {"type": "preflight", "description": "Run preflight before planning or editing"}

    if change_status in ("proposed", "clarifying"):
        return {"type": "clarification", "description": "Clarify the change before specifying it"}

    if gates.get("specification") in ("pending", "unknown"):
        return {"type": "specification", "description": "Write the specification for this change"}

    if route == "critical" and gates.get("architecture") in ("pending", "unknown"):
        return {"type": "architecture", "description": "Produce the architecture review this route requires"}

    if change_status in ("specified", "ready"):
        return {"type": "implementation", "description": "Implement the first vertical slice"}

    if change_status == "implementing":
        return {"type": "implementation", "description": "Continue the implementation"}

    if gates.get("tests") in ("pending", "unknown"):
        return {"type": "tests", "description": "Run and record the tests for this change"}

    if change_status == "verifying":
        return {"type": "verification", "description": "Produce fresh verification evidence"}

    if gates.get("review") in ("pending", "unknown"):
        return {"type": "review", "description": "Review the change"}

    if gates.get("documentation") in ("pending", "unknown"):
        return {"type": "documentation", "description": "Converge the documentation with the change"}

    return {"type": "merge_ready", "description": "Every gate is settled; the change can be merged"}


# ---------------------------------------------------------------------------
# Summary. Pure.
# ---------------------------------------------------------------------------


def summarize(document: dict[str, Any]) -> dict[str, Any]:
    """Condense the document into the shape the registry caches and `status show` renders."""
    gates = document.get("gates") or {}
    counts: dict[str, int] = {state: 0 for state in GATE_STATES}
    for name in GATE_NAMES:
        state = gates.get(name)
        if isinstance(state, str) and state in counts:
            counts[state] += 1

    change = document.get("activeChange")
    active: dict[str, Any] | None = None
    if isinstance(change, dict):
        active = {
            "id": change.get("id"),
            "title": change.get("title"),
            "route": change.get("route"),
            "status": change.get("status"),
            "branch": change.get("branch"),
        }

    lifecycle = document.get("lifecycle") or {}
    phase = lifecycle.get("phase") if isinstance(lifecycle, dict) else None

    return {
        "project": (document.get("project") or {}).get("id"),
        "name": (document.get("project") or {}).get("name"),
        "phase": {
            "id": (phase or {}).get("id"),
            "name": (phase or {}).get("name"),
            "status": (phase or {}).get("status"),
        },
        "activeChange": active,
        "gates": counts,
        "nextAction": next_action(document),
        "updatedAt": document.get("updatedAt"),
    }


# ---------------------------------------------------------------------------
# Persistence.
# ---------------------------------------------------------------------------


def status_path(target: Path) -> Path:
    return target / STATUS_RELATIVE


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_status(target: Path) -> dict[str, Any]:
    """Read the declared document. Missing and unparseable are distinct failures."""
    path = status_path(target)
    if not path.is_file():
        raise FileNotFoundError(
            f"VibeSpec found no project status.\n"
            f"\n"
            f"Expected file:\n"
            f"  {path}\n"
            f"\n"
            f"Recommended action:\n"
            f"  Create it with:\n"
            f'    vibespec status init "{target}"'
        )
    return read_json(path)


def write_status(target: Path, document: dict[str, Any]) -> Path:
    """Validate then write atomically. An invalid document never reaches the disk."""
    errors = validate_status(document)
    if errors:
        raise ValueError(_validation_message(errors))
    path = status_path(target)
    write_json(path, document)
    return path


def _validation_message(errors: list[dict[str, str]]) -> str:
    lines = ["VibeSpec refused to write an invalid project status.", ""]
    for item in errors:
        lines.append(f"  {item['code']} at {item.get('path', '$')}")
        lines.append(f"    {item['message']}")
        if item.get("suggestion"):
            lines.append(f"    {item['suggestion']}")
    return "\n".join(lines)


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "project"


def _detect_identity(target: Path) -> tuple[str, str]:
    """Derive the project id and name, preferring the project configuration."""
    config_path = target / PROJECT_CONFIG_RELATIVE
    if config_path.is_file():
        try:
            config = read_project_config(config_path)
        except (OSError, ValueError):
            config = {}
        project = config.get("project")
        if isinstance(project, dict):
            name = project.get("name")
            if isinstance(name, str) and name.strip():
                return _slugify(name), name
    return _slugify(target.name), target.name


def _detect_distribution(target: Path) -> str:
    lock = target / LOCK_RELATIVE
    if lock.is_file():
        try:
            declared = read_json(lock).get("distribution")
        except (OSError, ValueError):
            declared = None
        if isinstance(declared, str) and declared:
            return declared
    if (target / ".vibespec/templates").is_dir():
        return "repository-local"
    return "unknown"


def _pack_version() -> str:
    for candidate in (SCRIPT_DIR.parent / "manifest.json", SCRIPT_DIR.parent / "bundle/manifest.json"):
        if candidate.is_file():
            try:
                return str(read_json(candidate).get("version", "unknown"))
            except (OSError, ValueError):
                continue
    return "unknown"


def init_status(target: Path, *, force: bool = False) -> Path:
    """Create the document.

    Nothing about the business phase is guessed. A fresh project is `planned` with no
    active change and every gate `unknown`, because inferring a phase from a directory
    name would put a fabricated claim into a file whose whole value is being trustworthy.
    """
    target = target.expanduser().resolve()
    path = status_path(target)
    if path.exists() and not force:
        raise FileExistsError(
            f"VibeSpec refused to overwrite the existing project status.\n"
            f"\n"
            f"Existing file:\n"
            f"  {path}\n"
            f"\n"
            f"Recommended action:\n"
            f"  Inspect it with:\n"
            f'    vibespec status show "{target}"\n'
            f"\n"
            f"To replace it explicitly:\n"
            f'    vibespec status init "{target}" --force\n'
            f"\n"
            f"Risk:\n"
            f"  --force discards the declared phase, change, and gate states permanently."
        )

    identifier, name = _detect_identity(target)
    document: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "project": {"id": identifier, "name": name},
        "vibespec": {"version": _pack_version(), "distribution": _detect_distribution(target)},
        "lifecycle": {
            "phase": {"id": "unplanned", "name": "Unplanned", "status": "planned"},
            "milestone": None,
        },
        "activeChange": None,
        "workflow": {"stopAfterMerge": True, "allowParallelChanges": False},
        "gates": {name: "unknown" for name in GATE_NAMES},
        "nextAction": {"type": "change_selection", "description": "Select or declare the next change"},
        "updatedAt": _now(),
    }
    document["nextAction"] = next_action(document)
    return write_status(target, document)


def set_status(
    target: Path,
    *,
    phase_status: str | None = None,
    change_status: str | None = None,
    gate: tuple[str, str] | None = None,
    next_action_type: str | None = None,
) -> list[dict[str, str]]:
    """Update a bounded set of fields.

    Only these four are settable. There is deliberately no way to write an arbitrary JSON
    path: a status file that any command can reshape stops being a contract.
    """
    document = read_status(target)
    changes: list[dict[str, str]] = []

    if phase_status is not None:
        if phase_status not in PHASE_STATES:
            raise ValueError(f"Unsupported phase status: {phase_status}. {_choice_suggestion(PHASE_STATES)}")
        phase = document.setdefault("lifecycle", {}).setdefault("phase", {})
        changes.append({"path": "$.lifecycle.phase.status", "from": phase.get("status"), "to": phase_status})
        phase["status"] = phase_status

    if change_status is not None:
        if change_status not in CHANGE_STATES:
            raise ValueError(f"Unsupported change status: {change_status}. {_choice_suggestion(CHANGE_STATES)}")
        change = document.get("activeChange")
        if not isinstance(change, dict):
            raise ValueError(
                "There is no active change to update.\n"
                "Declare one in .vibespec/status.json before setting its status."
            )
        changes.append({"path": "$.activeChange.status", "from": change.get("status"), "to": change_status})
        change["status"] = change_status

    if gate is not None:
        name, state = gate
        if name not in GATE_NAMES:
            raise ValueError(f"Unknown gate: {name}. {_choice_suggestion(GATE_NAMES)}")
        if state not in GATE_STATES:
            raise ValueError(f"Unsupported gate state: {state}. {_choice_suggestion(GATE_STATES)}")
        gates = document.setdefault("gates", {})
        changes.append({"path": f"$.gates.{name}", "from": gates.get(name), "to": state})
        gates[name] = state

    if next_action_type is not None:
        if next_action_type not in NEXT_ACTION_TYPES:
            raise ValueError(
                f"Unsupported next action: {next_action_type}. {_choice_suggestion(NEXT_ACTION_TYPES)}"
            )
        action = document.setdefault("nextAction", {})
        changes.append({"path": "$.nextAction.type", "from": action.get("type"), "to": next_action_type})
        action["type"] = next_action_type
        action["description"] = action.get("description") or next_action_type.replace("_", " ")

    if not changes:
        raise ValueError(
            "Nothing to set.\n"
            "Pass at least one of --phase-status, --change-status, --gate, or --next-action."
        )

    document["updatedAt"] = _now()
    write_status(target, document)
    return changes


# ---------------------------------------------------------------------------
# Reconciliation.
# ---------------------------------------------------------------------------

# The only paths --apply-safe may write. Every one is an objective fact that can be read
# from the environment. No phase, no change status, no route, no gate, and no next action
# appears here, and a test asserts that.
#
# The declared branch is deliberately absent even though Git can observe the current one.
# Rewriting it from HEAD would silently redefine what the team said it was working on, which
# is exactly the kind of quiet substitution that makes a status file untrustworthy.
SAFE_RECONCILE_PATHS = (
    "$.vibespec.version",
    "$.vibespec.distribution",
    "$.updatedAt",
)


def _difference(path: str, declared: Any, observed: Any, safe: bool, reason: str) -> dict[str, Any]:
    return {"path": path, "declared": declared, "observed": observed, "safe": safe, "reason": reason}


def reconcile_status(target: Path, *, apply_safe: bool = False) -> dict[str, Any]:
    """Compare the declared document with observed facts.

    Read-only by default. With apply_safe it corrects objective facts only: the VibeSpec
    version, the distribution, and the timestamp. Business judgement is never rewritten.
    """
    target = Path(target).expanduser().resolve()
    document = read_status(target)

    git = observe_repository(target)
    observed_distribution = _detect_distribution(target)
    observed_version = _pack_version()
    lock_version = None
    lock_path = target / LOCK_RELATIVE
    if lock_path.is_file():
        try:
            lock_version = read_json(lock_path).get("vibespec_version")
        except (OSError, ValueError):
            lock_version = None
    if isinstance(lock_version, str) and lock_version:
        observed_version = lock_version

    differences: list[dict[str, Any]] = []
    section = document.get("vibespec") or {}

    if section.get("version") != observed_version:
        differences.append(
            _difference(
                "$.vibespec.version",
                section.get("version"),
                observed_version,
                True,
                "The installed pack reports a different version.",
            )
        )
    if section.get("distribution") != observed_distribution and observed_distribution != "unknown":
        differences.append(
            _difference(
                "$.vibespec.distribution",
                section.get("distribution"),
                observed_distribution,
                True,
                "The detected distribution differs from the declared one.",
            )
        )

    change = document.get("activeChange")
    if isinstance(change, dict) and change.get("branch") and git.get("available"):
        observed_branch = git.get("branch")
        if observed_branch and observed_branch != change["branch"]:
            differences.append(
                _difference(
                    "$.activeChange.branch",
                    change["branch"],
                    observed_branch,
                    False,
                    "Reported only. Switch branch or update the declaration deliberately; "
                    "VibeSpec will not choose for you.",
                )
            )
        if not branch_exists(target, change["branch"]):
            differences.append(
                _difference(
                    "$.activeChange.branch",
                    change["branch"],
                    "no such local branch",
                    False,
                    "Reported only. The declared branch does not exist locally.",
                )
            )

    differences.sort(key=lambda item: (item["path"], str(item["observed"])))

    applied = False
    safe_differences = [item for item in differences if item["safe"]]
    if apply_safe and safe_differences:
        for item in safe_differences:
            if item["path"] == "$.vibespec.version":
                document.setdefault("vibespec", {})["version"] = item["observed"]
            elif item["path"] == "$.vibespec.distribution":
                document.setdefault("vibespec", {})["distribution"] = item["observed"]
        document["updatedAt"] = _now()
        write_status(target, document)
        applied = True

    return {
        "target": str(target),
        "applied": applied,
        "differences": differences,
        "observed": {"git": git, "distribution": observed_distribution, "version": observed_version},
    }


def format_reconcile(report: dict[str, Any]) -> str:
    lines = ["VibeSpec status reconcile", "", f"Target: {report['target']}"]
    git = report["observed"]["git"]
    if not git.get("available"):
        lines.append(f"Git: unavailable ({git.get('reason')})")
    else:
        lines.append(f"Git: {git.get('branch')} at {(git.get('commit') or '')[:12]}")

    if not report["differences"]:
        lines.extend(["", "The declared state matches every observation."])
        return "\n".join(lines)

    lines.append("")
    lines.append("Differences:")
    for item in report["differences"]:
        marker = "safe" if item["safe"] else "reported only"
        lines.append(f"  {item['path']}  ({marker})")
        lines.append(f"    declared: {item['declared']}")
        lines.append(f"    observed: {item['observed']}")
        lines.append(f"    {item['reason']}")

    lines.append("")
    lines.append(
        "Applied the safe corrections." if report["applied"] else "Nothing was written. Use --apply-safe to correct the objective facts."
    )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Rendering.
# ---------------------------------------------------------------------------


def format_show(summary: dict[str, Any]) -> str:
    lines = [f"Project: {summary.get('name') or summary.get('project') or 'unknown'}"]
    phase = summary.get("phase") or {}
    lines.append(f"Phase: {phase.get('name') or 'unknown'} ({phase.get('status') or 'unknown'})")

    change = summary.get("activeChange")
    if change:
        lines.append(f"Active change: {change.get('title') or change.get('id')}")
        lines.append(f"Route: {(change.get('route') or 'unknown').capitalize()}")
        lines.append(f"State: {(change.get('status') or 'unknown').capitalize()}")
        lines.append(f"Branch: {change.get('branch') or 'none declared'}")
    else:
        lines.append("Active change: none")

    counts = summary.get("gates") or {}
    reported = [f"{counts[state]} {state}" for state in GATE_STATES if counts.get(state)]
    lines.append("Gates: " + (", ".join(reported) if reported else "none"))

    action = summary.get("nextAction") or {}
    lines.append(f"Next action: {action.get('description') or action.get('type') or 'unknown'}")
    return "\n".join(lines)


def format_changes(changes: list[dict[str, str]]) -> str:
    lines = ["Updated project status:"]
    for change in changes:
        lines.append(f"  {change['path']}: {change['from']} -> {change['to']}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI.
# ---------------------------------------------------------------------------


def _target(args: argparse.Namespace) -> Path:
    return resolve_target_argument(args.target_positional, args.target_option)


def _add_common(parser: argparse.ArgumentParser) -> None:
    add_target_arguments(parser)
    parser.add_argument("--json", action="store_true", dest="as_json")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    initializer = subparsers.add_parser("init", help="Create .vibespec/status.json")
    _add_common(initializer)
    initializer.add_argument("--force", action="store_true", help="Replace an existing status document")

    for name, help_text in (
        ("show", "Print a readable project state summary"),
        ("validate", "Validate the schema and internal invariants"),
        ("next", "Print the next authorized action"),
    ):
        _add_common(subparsers.add_parser(name, help=help_text))

    reconciler = subparsers.add_parser(
        "reconcile", help="Compare the declared state with observed facts"
    )
    _add_common(reconciler)
    reconciler.add_argument(
        "--apply-safe",
        action="store_true",
        dest="apply_safe",
        help="Correct objective facts only: version, distribution, timestamp. Never business state.",
    )

    setter = subparsers.add_parser("set", help="Update a bounded set of declared fields")
    _add_common(setter)
    setter.add_argument("--phase-status", choices=PHASE_STATES)
    setter.add_argument("--change-status", choices=CHANGE_STATES)
    setter.add_argument("--gate", nargs=2, metavar=("GATE", "STATE"))
    setter.add_argument("--next-action", dest="next_action_type", choices=NEXT_ACTION_TYPES)

    args = parser.parse_args()
    command = f"status.{args.command}"

    try:
        target = _target(args)
    except ValueError as exc:
        return refuse(command, "TARGET_INVALID", str(exc), as_json=args.as_json)

    try:
        if args.command == "init":
            path = init_status(target, force=args.force)
            payload = envelope(command, result={"path": str(path)})
            return emit(payload, as_json=args.as_json, human=str(path))

        if args.command == "validate":
            document = read_status(target)
            errors = validate_status(document)
            payload = envelope(command, result={"valid": True} if not errors else None, errors=errors)
            human = "Project status is valid." if not errors else ""
            return emit(payload, as_json=args.as_json, human=human)

        if args.command == "show":
            document = read_status(target)
            errors = validate_status(document)
            summary = summarize(document)
            payload = envelope(command, result=summary, errors=errors)
            return emit(payload, as_json=args.as_json, human=format_show(summary) if not errors else "")

        if args.command == "next":
            document = read_status(target)
            errors = validate_status(document)
            if errors:
                payload = envelope(command, errors=errors)
                return emit(payload, as_json=args.as_json)
            action = next_action(document)
            payload = envelope(command, result=action)
            return emit(payload, as_json=args.as_json, human=f"{action['type']}: {action['description']}")

        if args.command == "reconcile":
            report = reconcile_status(target, apply_safe=args.apply_safe)
            payload = envelope(command, result=report)
            return emit(payload, as_json=args.as_json, human=format_reconcile(report))

        if args.command == "set":
            gate = tuple(args.gate) if args.gate else None
            changes = set_status(
                target,
                phase_status=args.phase_status,
                change_status=args.change_status,
                gate=gate,
                next_action_type=args.next_action_type,
            )
            payload = envelope(command, result={"changes": changes})
            return emit(payload, as_json=args.as_json, human=format_changes(changes))
    except FileNotFoundError as exc:
        return refuse(command, "STATUS_NOT_FOUND", str(exc), as_json=args.as_json)
    except FileExistsError as exc:
        return refuse(command, "STATUS_ALREADY_EXISTS", str(exc), as_json=args.as_json)
    except ValueError as exc:
        return refuse(command, "STATUS_INVALID", str(exc), as_json=args.as_json)
    except json.JSONDecodeError as exc:  # pragma: no cover - read_json normalizes these
        return refuse(command, "STATUS_UNREADABLE", str(exc), as_json=args.as_json)

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
