#!/usr/bin/env python3
"""Structured verification evidence, `.vibespec/evidence/<change-id>/<evidence-id>.json`.

Evidence answers "was this actually verified, and how?" in a form a machine can read and a
reviewer can audit.

What VibeSpec guarantees, precisely:

- It never automatically records command output or the process environment. Only the command
  line, its status, its exit code, and its duration are kept.
- A command stored in an evidence file is data. Reading, listing, validating, and querying
  never execute anything. Execution happens at one site in this module and only when the
  caller passes `--run`.
- Evidence cannot read or write outside `.vibespec/evidence`. Identifiers are validated, and
  symlinked evidence roots, change directories, and files are refused.
- Artifact references are resolved and confined to the project.

What VibeSpec does not guarantee: that no secret reaches an evidence file. A command line, a
requirement, a remaining risk, or a branch name is recorded verbatim because it is the record.
`--command 'curl -H "Authorization: Bearer …"'` writes that header into a committed file. The
schema keeps output and environment out; keeping credentials out of the values you pass is
the caller's responsibility.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import shlex
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from vibespec_atomic import read_json  # noqa: E402
from vibespec_common import add_target_arguments, fail, parse_csv, resolve_target_argument  # noqa: E402
from vibespec_git import observe_repository  # noqa: E402
from vibespec_json import emit, envelope, error, refuse  # noqa: E402

SCHEMA_VERSION = 1
EVIDENCE_ROOT = Path(".vibespec/evidence")

EVIDENCE_TYPES = (
    "preflight",
    "specification",
    "architecture",
    "test",
    "verification",
    "review",
    "documentation",
    "release",
)
RESULTS = ("passed", "failed", "blocked", "inconclusive")
COMMAND_STATUSES = ("passed", "failed", "skipped", "not_run")

# Strict field allowlists. Unknown keys are rejected rather than trusted, so a hand-authored
# document cannot smuggle a "stdout" field past validation and into a committed file.
DOCUMENT_FIELDS = (
    "schemaVersion",
    "evidenceId",
    "changeId",
    "type",
    "createdAt",
    "environment",
    "source",
    "requirements",
    "commands",
    "artifacts",
    "remainingRisks",
    "result",
)
REQUIRED_DOCUMENT_FIELDS = ("schemaVersion", "evidenceId", "changeId", "type", "createdAt", "result")
COMMAND_FIELDS = ("command", "status", "exitCode", "durationMs")
ENVIRONMENT_FIELDS = ("platform", "python")
SOURCE_FIELDS = ("commit", "branch", "dirty")
ARTIFACT_FIELDS = ("type", "path", "sha256")

# Identifiers become path segments, so they are constrained to a shape that cannot traverse,
# cannot name a drive, and cannot carry a control character. Uppercase is allowed because
# evidence identifiers embed an ISO timestamp.
IDENTIFIER = re.compile(r"\A[A-Za-z0-9][A-Za-z0-9._-]{0,127}\Z")
TIMESTAMP = re.compile(r"\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\Z")
SHA256 = re.compile(r"\A[0-9a-f]{64}\Z")

_COMMAND_TIMEOUT_SECONDS = 900


class UnsafeIdentifierError(ValueError):
    """An identifier could be used as a path segment to escape the evidence root."""


class UnsafePathError(ValueError):
    """A path resolves outside the project or traverses a symlink."""


# ---------------------------------------------------------------------------
# Identifier and path confinement.
# ---------------------------------------------------------------------------


def validate_identifier(value: Any, *, field: str) -> str:
    """Return a validated identifier or raise.

    This is the single gate for anything that becomes a path segment. Lexical checks alone are
    not enough once symlinks exist, so callers pair it with containment checks below.
    """
    if not isinstance(value, str) or not IDENTIFIER.match(value):
        raise UnsafeIdentifierError(
            f"VibeSpec refused an unsafe {field}.\n"
            f"\n"
            f"Value:\n"
            f"  {value!r}\n"
            f"\n"
            f"Reason:\n"
            f"  {field} becomes a filesystem path segment. It must match\n"
            f"  [A-Za-z0-9][A-Za-z0-9._-]{{0,127}}: no separators, no drive prefix,\n"
            f"  no '.' or '..' segment, no control character, and never empty.\n"
            f"\n"
            f"Recommended action:\n"
            f"  Use a slug such as places-resolver-validation."
        )
    return value


def _is_contained(candidate: Path, root: Path) -> bool:
    try:
        return candidate == root or candidate.is_relative_to(root)
    except AttributeError:  # pragma: no cover - Python 3.9 and older
        return str(candidate).startswith(str(root) + os.sep)


def _reject_symlink(path: Path, description: str) -> None:
    if path.is_symlink():
        raise UnsafePathError(
            f"VibeSpec refused to follow a symlinked {description}.\n"
            f"\n"
            f"Path:\n"
            f"  {path}\n"
            f"\n"
            f"Reason:\n"
            f"  A symlink here can make VibeSpec read or write outside the project.\n"
            f"  Evidence is confined to .vibespec/evidence by design."
        )


def evidence_root(target: Path) -> Path:
    return Path(target) / EVIDENCE_ROOT


def change_root(target: Path, change_id: str) -> Path:
    """Return the change directory, refusing anything that could escape the evidence root."""
    validate_identifier(change_id, field="changeId")
    root = evidence_root(target)
    _reject_symlink(root, "evidence root")
    directory = root / change_id
    _reject_symlink(directory, "change directory")

    # Belt and braces: prove containment after resolution, so a symlink introduced between
    # the check and the use still cannot place the directory outside the evidence root.
    resolved_root = root.resolve() if root.exists() else root.absolute()
    resolved = directory.resolve() if directory.exists() else (resolved_root / change_id)
    if not _is_contained(resolved, resolved_root):
        raise UnsafePathError(
            f"VibeSpec refused a change directory outside the evidence root.\n"
            f"\n"
            f"Resolved to:\n"
            f"  {resolved}\n"
            f"\n"
            f"Evidence root:\n"
            f"  {resolved_root}"
        )
    return directory


def resolve_artifact(target: Path, relative: Any) -> Path:
    """Resolve one artifact reference and prove it stays inside the project.

    Lexical rejection of `..` is not enough: `artifacts/report.json` can be a symlink to
    anything on the machine, and both is_file() and read_bytes() follow it.
    """
    if not isinstance(relative, str) or not relative:
        raise UnsafePathError(f"VibeSpec refused an empty artifact path: {relative!r}")
    if relative.startswith(("/", "\\")) or re.match(r"\A[A-Za-z]:", relative):
        raise UnsafePathError(
            f"VibeSpec refused an absolute artifact path.\n\nPath:\n  {relative}\n"
            "\nReason:\n  Artifact paths must be relative to the project."
        )
    if any(part == ".." for part in re.split(r"[\\/]+", relative)):
        raise UnsafePathError(
            f"VibeSpec refused an artifact path that traverses upwards.\n\nPath:\n  {relative}"
        )

    root = Path(target).resolve()
    candidate = root / relative
    _reject_symlink(candidate, "artifact")
    try:
        resolved = candidate.resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise FileNotFoundError(
            f"VibeSpec refused to record an artifact it cannot resolve.\n"
            f"\n"
            f"Path:\n"
            f"  {candidate}\n"
            f"\n"
            f"Reason:\n"
            f"  {exc}"
        ) from exc
    if not _is_contained(resolved, root):
        raise UnsafePathError(
            f"VibeSpec refused an artifact that resolves outside the project.\n"
            f"\n"
            f"Declared:\n"
            f"  {relative}\n"
            f"\n"
            f"Resolves to:\n"
            f"  {resolved}\n"
            f"\n"
            f"Project root:\n"
            f"  {root}"
        )
    if not resolved.is_file():
        raise FileNotFoundError(
            f"VibeSpec refused to record an artifact that is not a file.\n\nPath:\n  {resolved}"
        )
    return resolved


# ---------------------------------------------------------------------------
# Validation. Pure.
# ---------------------------------------------------------------------------


def _error(code: str, message: str, path: str, suggestion: str | None = None) -> dict[str, str]:
    return error(code, message, path=path, suggestion=suggestion)


def _check_unknown(
    payload: dict[str, Any], allowed: tuple[str, ...], prefix: str, errors: list[dict[str, str]]
) -> None:
    for key in sorted(payload):
        if key not in allowed:
            errors.append(
                _error(
                    "EVIDENCE_UNKNOWN_FIELD",
                    f"Unknown field: {key}",
                    f"{prefix}.{key}",
                    "Only these fields are recordable: " + ", ".join(allowed),
                )
            )


def _is_integer(value: Any) -> bool:
    """Report whether a value is an integer, excluding booleans.

    `isinstance(True, int)` is true in Python, so a document recording `"exitCode": false`
    would otherwise pass an integer check and then compare equal to zero — a failed command
    reading as a success.
    """
    return isinstance(value, int) and not isinstance(value, bool)


# What an exit code may be, per command status. A status is a verdict and an exit code is the
# evidence for it; a document where the two disagree is not partially right, it is unusable.
_EXIT_CODE_RULES = {
    "passed": "A passed command must record exit code 0",
    "failed": "A failed command must record a non-zero exit code, or null when it timed out",
    "skipped": "A command that did not run cannot have an exit code",
    "not_run": "A command that did not run cannot have an exit code",
}


def _check_exit_code(entry: dict[str, Any], prefix: str, errors: list[dict[str, str]]) -> None:
    status = entry.get("status")
    if status not in _EXIT_CODE_RULES:
        return
    code = entry.get("exitCode")
    if code is not None and not _is_integer(code):
        return  # Already reported as a type error; do not pile a second message on it.

    if status == "passed":
        consistent = code == 0
    elif status == "failed":
        # Null is permitted only here: a timed-out or signalled command has no exit status,
        # and inventing one would be a lie.
        consistent = code is None or code != 0
    else:
        consistent = code is None

    if not consistent:
        errors.append(
            _error(
                "EVIDENCE_CONTRADICTORY_COMMAND",
                _EXIT_CODE_RULES[status],
                f"{prefix}.exitCode",
                "Correct the exit code, or change the status to match what happened",
            )
        )


def _check_string_list(value: Any, prefix: str, errors: list[dict[str, str]]) -> None:
    if value is None:
        return
    if not isinstance(value, list):
        errors.append(_error("EVIDENCE_INVALID_TYPE", "Expected a list", prefix))
        return
    for index, item in enumerate(value):
        if not isinstance(item, str):
            errors.append(_error("EVIDENCE_INVALID_TYPE", "Expected a string", f"{prefix}[{index}]"))


def validate_evidence(document: Any) -> list[dict[str, str]]:
    """Validate one evidence document strictly. No filesystem access, no clock."""
    errors: list[dict[str, str]] = []

    if not isinstance(document, dict):
        return [_error("EVIDENCE_INVALID_TYPE", "The evidence document must be a JSON object", "$")]

    _check_unknown(document, DOCUMENT_FIELDS, "$", errors)

    for field in REQUIRED_DOCUMENT_FIELDS:
        if field not in document:
            errors.append(
                _error("EVIDENCE_MISSING_FIELD", f"Missing required field: {field}", f"$.{field}")
            )

    if document.get("schemaVersion") not in (None, SCHEMA_VERSION):
        errors.append(
            _error(
                "EVIDENCE_UNSUPPORTED_SCHEMA_VERSION",
                f"Unsupported schemaVersion: {document['schemaVersion']}",
                "$.schemaVersion",
                f"This VibeSpec understands schemaVersion {SCHEMA_VERSION}",
            )
        )

    for field in ("evidenceId", "changeId"):
        value = document.get(field)
        if value is not None and (not isinstance(value, str) or not IDENTIFIER.match(value)):
            errors.append(
                _error(
                    "EVIDENCE_INVALID_IDENTIFIER",
                    f"Not a safe identifier: {value!r}",
                    f"$.{field}",
                    "Use [A-Za-z0-9][A-Za-z0-9._-]{0,127}",
                )
            )

    if "type" in document and document["type"] not in EVIDENCE_TYPES:
        errors.append(
            _error(
                "EVIDENCE_INVALID_TYPE",
                f"Unsupported evidence type: {document['type']}",
                "$.type",
                "Use one of: " + ", ".join(EVIDENCE_TYPES),
            )
        )

    if "result" in document and document["result"] not in RESULTS:
        errors.append(
            _error(
                "EVIDENCE_INVALID_RESULT",
                f"Unsupported result: {document['result']}",
                "$.result",
                "Use one of: " + ", ".join(RESULTS),
            )
        )

    stamp = document.get("createdAt")
    if stamp is not None and (not isinstance(stamp, str) or not TIMESTAMP.match(stamp)):
        errors.append(
            _error(
                "EVIDENCE_INVALID_TIMESTAMP",
                f"Not an ISO 8601 UTC timestamp: {stamp}",
                "$.createdAt",
                "Use a value such as 2026-07-30T00:15:00Z",
            )
        )

    environment = document.get("environment")
    if environment is not None:
        if not isinstance(environment, dict):
            errors.append(_error("EVIDENCE_INVALID_TYPE", "Expected an object", "$.environment"))
        else:
            _check_unknown(environment, ENVIRONMENT_FIELDS, "$.environment", errors)
            for field in ENVIRONMENT_FIELDS:
                if field in environment and not isinstance(environment[field], str):
                    errors.append(
                        _error("EVIDENCE_INVALID_TYPE", "Expected a string", f"$.environment.{field}")
                    )

    source = document.get("source")
    if source is not None:
        if not isinstance(source, dict):
            errors.append(_error("EVIDENCE_INVALID_TYPE", "Expected an object", "$.source"))
        else:
            _check_unknown(source, SOURCE_FIELDS, "$.source", errors)
            for field in ("commit", "branch"):
                value = source.get(field)
                if value is not None and not isinstance(value, str):
                    errors.append(
                        _error("EVIDENCE_INVALID_TYPE", "Expected a string or null", f"$.source.{field}")
                    )
            if source.get("dirty") is not None and not isinstance(source["dirty"], bool):
                errors.append(
                    _error("EVIDENCE_INVALID_TYPE", "Expected a boolean or null", "$.source.dirty")
                )

    _check_string_list(document.get("requirements"), "$.requirements", errors)
    _check_string_list(document.get("remainingRisks"), "$.remainingRisks", errors)

    commands = document.get("commands")
    if commands is not None and not isinstance(commands, list):
        errors.append(_error("EVIDENCE_INVALID_TYPE", "Expected a list", "$.commands"))
    else:
        for index, entry in enumerate(commands or []):
            prefix = f"$.commands[{index}]"
            if not isinstance(entry, dict):
                errors.append(_error("EVIDENCE_INVALID_TYPE", "Expected an object", prefix))
                continue
            _check_unknown(entry, COMMAND_FIELDS, prefix, errors)
            if not isinstance(entry.get("command"), str) or not entry.get("command"):
                errors.append(
                    _error("EVIDENCE_INVALID_TYPE", "Expected a non-empty string", f"{prefix}.command")
                )
            if entry.get("status") not in COMMAND_STATUSES:
                errors.append(
                    _error(
                        "EVIDENCE_INVALID_COMMAND_STATUS",
                        f"Unsupported command status: {entry.get('status')}",
                        f"{prefix}.status",
                        "Use one of: " + ", ".join(COMMAND_STATUSES),
                    )
                )
            for field in ("exitCode", "durationMs"):
                value = entry.get(field)
                if value is not None and not _is_integer(value):
                    errors.append(
                        _error("EVIDENCE_INVALID_TYPE", "Expected an integer or null", f"{prefix}.{field}")
                    )
            duration = entry.get("durationMs")
            if _is_integer(duration) and duration < 0:
                errors.append(
                    _error(
                        "EVIDENCE_INVALID_TYPE",
                        "Expected a duration of zero or more milliseconds",
                        f"{prefix}.durationMs",
                    )
                )
            _check_exit_code(entry, prefix, errors)

    artifacts = document.get("artifacts")
    if artifacts is not None and not isinstance(artifacts, list):
        errors.append(_error("EVIDENCE_INVALID_TYPE", "Expected a list", "$.artifacts"))
    else:
        for index, artifact in enumerate(artifacts or []):
            prefix = f"$.artifacts[{index}]"
            if not isinstance(artifact, dict):
                errors.append(_error("EVIDENCE_INVALID_TYPE", "Expected an object", prefix))
                continue
            _check_unknown(artifact, ARTIFACT_FIELDS, prefix, errors)
            relative = artifact.get("path")
            unsafe = (
                not isinstance(relative, str)
                or not relative
                or relative.startswith(("/", "\\"))
                or bool(re.match(r"\A[A-Za-z]:", relative))
                or any(part == ".." for part in re.split(r"[\\/]+", relative))
            )
            if unsafe:
                errors.append(
                    _error(
                        "EVIDENCE_UNSAFE_ARTIFACT_PATH",
                        f"Artifact path escapes the project: {relative!r}",
                        f"{prefix}.path",
                        "Use a relative path inside the project",
                    )
                )
            digest = artifact.get("sha256")
            if not isinstance(digest, str) or not SHA256.match(digest):
                errors.append(
                    _error(
                        "EVIDENCE_INVALID_ARTIFACT_HASH",
                        f"Not a SHA-256 digest: {digest!r}",
                        f"{prefix}.sha256",
                        "Record 64 lowercase hexadecimal characters",
                    )
                )

    _check_result_consistency(document, errors)

    return sorted(errors, key=lambda item: (item.get("path", ""), item["code"]))


def _check_result_consistency(document: dict[str, Any], errors: list[dict[str, str]]) -> None:
    """A passed result cannot coexist with a failed or unexecuted command.

    Evidence exists to be believed. A document claiming success while its own record shows a
    failed command is worse than no evidence, because it looks like proof.
    """
    if document.get("result") != "passed":
        return
    commands = document.get("commands")
    if not isinstance(commands, list) or not commands:
        return
    statuses = [entry.get("status") for entry in commands if isinstance(entry, dict)]

    # Every declared command must have passed. Schema version 1 has no way to mark a command
    # optional, so a record claiming the whole verification passed cannot quietly carry one
    # that failed, was skipped, or never ran.
    outstanding = sorted({status for status in statuses if status != "passed"})
    if outstanding:
        errors.append(
            _error(
                "EVIDENCE_CONTRADICTORY_RESULT",
                "The result is passed while these commands did not pass: " + ", ".join(outstanding),
                "$.result",
                "Run every declared command with --run, remove the ones that do not apply, "
                "or record an honest result such as inconclusive",
            )
        )


# ---------------------------------------------------------------------------
# Normalization and execution.
# ---------------------------------------------------------------------------


def normalize_command(entry: dict[str, Any]) -> dict[str, Any]:
    """Keep only recordable command fields."""
    return {field: entry.get(field) for field in COMMAND_FIELDS if field in entry or field == "command"}


def describe_environment() -> dict[str, str]:
    """Record the platform and interpreter. Never environment variables."""
    return {"platform": sys.platform, "python": platform.python_version()}


def tokenize(command: str, *, windows: bool | None = None) -> list[str]:
    """Split a command line into an argv list.

    Commands are executed without a shell, so they must be tokenized here. POSIX rules treat
    a backslash as an escape, which would destroy Windows paths, so Windows uses the
    non-POSIX mode and the surrounding quotes are stripped afterwards. Both branches are pure
    and tested on every platform.
    """
    if windows is None:
        windows = os.name == "nt"
    if not windows:
        return shlex.split(command)
    tokens = shlex.split(command, posix=False)
    stripped: list[str] = []
    for token in tokens:
        if len(token) >= 2 and token[0] == token[-1] and token[0] in "\"'":
            stripped.append(token[1:-1])
        else:
            stripped.append(token)
    return stripped


def _execute(target: Path, command: str) -> dict[str, Any]:
    """The single execution site in this module, reachable only through run=True.

    No shell is interposed: the command is tokenized into an argv list, so metacharacters are
    arguments rather than syntax. A command needing shell composition belongs in a
    project-owned script that is then invoked as a single program.

    Execution is not sandboxed. It runs with the caller's privileges in the project directory
    and can modify it.

    On timeout, POSIX kills the whole process group: the command is started in its own session
    so a runner that spawned workers does not leave them behind still writing to the project.
    Windows terminates the direct child only, because Python offers no portable group kill;
    descendants there are the invoked tool's responsibility. That limit is documented rather
    than papered over.
    """
    argv = tokenize(command)
    if not argv:
        return {"command": command, "status": "skipped", "exitCode": None, "durationMs": None}

    started = time.monotonic()
    popen_extra: dict[str, Any] = {}
    if os.name != "nt":
        popen_extra["start_new_session"] = True

    process: subprocess.Popen[bytes] | None = None
    try:
        process = subprocess.Popen(
            argv,
            cwd=str(target),
            # Output is deliberately discarded rather than captured: only the verdict is
            # recorded, and buffering a noisy process just to drop it wastes memory.
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            **popen_extra,
        )
    except FileNotFoundError:
        duration = int((time.monotonic() - started) * 1000)
        return {"command": command, "status": "failed", "exitCode": 127, "durationMs": duration}
    except OSError:
        duration = int((time.monotonic() - started) * 1000)
        return {"command": command, "status": "failed", "exitCode": None, "durationMs": duration}

    try:
        returncode = process.wait(timeout=_COMMAND_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        _terminate_tree(process)
        duration = int((time.monotonic() - started) * 1000)
        return {"command": command, "status": "failed", "exitCode": None, "durationMs": duration}

    duration = int((time.monotonic() - started) * 1000)
    return {
        "command": command,
        "status": "passed" if returncode == 0 else "failed",
        "exitCode": returncode,
        "durationMs": duration,
    }


def _terminate_tree(process: subprocess.Popen[Any]) -> None:
    """Kill a timed-out command, taking its descendants with it where the platform allows."""
    if os.name != "nt":
        try:
            os.killpg(os.getpgid(process.pid), signal.SIGKILL)
        except (OSError, ProcessLookupError):
            process.kill()
    else:  # pragma: no cover - exercised only on Windows
        process.kill()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:  # pragma: no cover - the kill above is synchronous
        pass


# ---------------------------------------------------------------------------
# Persistence.
# ---------------------------------------------------------------------------


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _existing_ids(target: Path, change_id: str) -> set[str]:
    directory = change_root(target, change_id)
    if not directory.is_dir():
        return set()
    return {item.stem for item in directory.glob("*.json")}


def build_evidence_id(evidence_type: str, created_at: str, *, taken: set[str]) -> str:
    """Build a deterministic, collision-resistant identifier."""
    compact = created_at.replace("-", "").replace(":", "")
    base = f"{evidence_type}-{compact}"
    if base not in taken:
        return base
    counter = 2
    while f"{base}-{counter}" in taken:
        counter += 1
    return f"{base}-{counter}"


def read_evidence(path: Path) -> dict[str, Any]:
    """Read one evidence document. Commands inside are data and are never executed."""
    return read_json(path)


def _write_reserved(path: Path, document: dict[str, Any]) -> None:
    """Create the file exclusively, so a concurrent writer cannot be overwritten.

    os.replace would silently clobber a document another process wrote between our identifier
    scan and our write. Evidence is an audit record; losing one to a race is not acceptable.
    """
    text = json.dumps(document, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o666)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
    except BaseException:
        path.unlink(missing_ok=True)
        raise


def write_evidence(target: Path, change_id: str, document: dict[str, Any]) -> Path:
    """Validate, confine, and write one evidence document."""
    validate_identifier(change_id, field="changeId")
    evidence_id = validate_identifier(document.get("evidenceId"), field="evidenceId")

    if document.get("changeId") != change_id:
        raise ValueError(
            f"VibeSpec refused to store evidence under a mismatched change.\n"
            f"\n"
            f"Directory:\n"
            f"  {change_id}\n"
            f"\n"
            f"Document changeId:\n"
            f"  {document.get('changeId')!r}\n"
            f"\n"
            f"Reason:\n"
            f"  Evidence filed under one change while declaring another cannot be trusted\n"
            f"  to support that change's gates."
        )

    errors = validate_evidence(document)
    if errors:
        raise ValueError(_validation_message(errors))

    directory = change_root(target, change_id)
    path = directory / f"{evidence_id}.json"
    _reject_symlink(path, "evidence file")
    if path.exists():
        raise FileExistsError(
            f"VibeSpec refused to overwrite existing evidence.\n\nFile:\n  {path}"
        )
    _write_reserved(path, document)
    return path


def _validation_message(errors: list[dict[str, str]]) -> str:
    lines = ["VibeSpec refused to write invalid evidence.", ""]
    for item in errors:
        lines.append(f"  {item['code']} at {item.get('path', '$')}")
        lines.append(f"    {item['message']}")
        if item.get("suggestion"):
            lines.append(f"    {item['suggestion']}")
    return "\n".join(lines)


def _hash_artifact(target: Path, relative: str) -> dict[str, str]:
    resolved = resolve_artifact(target, relative)
    digest = hashlib.sha256(resolved.read_bytes()).hexdigest()
    return {"type": "artifact", "path": relative.replace("\\", "/"), "sha256": digest}


def verify_artifact(target: Path, entry: Any) -> str:
    """Re-check one recorded artifact against the file on disk today.

    A hash recorded at creation is a claim about a file at that moment. It becomes proof only
    when someone checks it again, so this re-runs the whole confinement chain rather than
    trusting the stored path: the artifact must still resolve inside the project, must not have
    become a symlink, and must still hash to the recorded value.

    Returns one of `verified`, `missing`, `modified`, `unsafe`, or `unhashed`. A tampered or
    vanished artifact does not make the evidence unreadable — it makes it unable to prove
    anything, which is a different thing and is reported as such.
    """
    if not isinstance(entry, dict):
        return "unhashed"
    recorded = entry.get("sha256")
    if not isinstance(recorded, str) or not re.fullmatch(r"[0-9a-f]{64}", recorded):
        return "unhashed"
    try:
        resolved = resolve_artifact(target, entry.get("path"))
    except FileNotFoundError:
        return "missing"
    except (UnsafePathError, OSError):
        return "unsafe"
    try:
        digest = hashlib.sha256(resolved.read_bytes()).hexdigest()
    except OSError:
        return "missing"
    return "verified" if digest == recorded else "modified"


def create_evidence(
    target: Path,
    *,
    change_id: str,
    evidence_type: str,
    result: str | None = None,
    requirements: list[str] | None = None,
    commands: list[str] | None = None,
    artifacts: list[str] | None = None,
    risks: list[str] | None = None,
    run: bool = False,
) -> Path:
    """Create one evidence document.

    Commands are recorded as `not_run` unless `run=True` is passed explicitly.
    """
    target = Path(target).expanduser().resolve()
    validate_identifier(change_id, field="changeId")
    if evidence_type not in EVIDENCE_TYPES:
        raise ValueError(
            f"Unsupported evidence type: {evidence_type}.\n"
            "Use one of: " + ", ".join(EVIDENCE_TYPES)
        )

    recorded_artifacts = [_hash_artifact(target, relative) for relative in (artifacts or [])]

    recorded_commands: list[dict[str, Any]] = []
    for command in commands or []:
        if run:
            recorded_commands.append(_execute(target, command))
        else:
            recorded_commands.append(
                {"command": command, "status": "not_run", "exitCode": None, "durationMs": None}
            )

    if result is None:
        statuses = [entry["status"] for entry in recorded_commands]
        if statuses and all(status == "passed" for status in statuses):
            result = "passed"
        elif "failed" in statuses:
            result = "failed"
        else:
            result = "inconclusive"
    if result not in RESULTS:
        raise ValueError(f"Unsupported result: {result}. Use one of: " + ", ".join(RESULTS))

    observed = observe_repository(target)
    created_at = _now()

    # Retry on collision: another process may have taken the identifier between the scan and
    # the exclusive create.
    for _ in range(64):
        document = {
            "schemaVersion": SCHEMA_VERSION,
            "evidenceId": build_evidence_id(
                evidence_type, created_at, taken=_existing_ids(target, change_id)
            ),
            "changeId": change_id,
            "type": evidence_type,
            "createdAt": created_at,
            "environment": describe_environment(),
            "source": {
                "commit": observed.get("commit"),
                "branch": observed.get("branch"),
                "dirty": observed.get("dirty"),
            },
            "requirements": list(requirements or []),
            "commands": recorded_commands,
            "artifacts": recorded_artifacts,
            "remainingRisks": list(risks or []),
            "result": result,
        }
        try:
            return write_evidence(target, change_id, document)
        except FileExistsError:
            continue
    raise FileExistsError("VibeSpec could not allocate a free evidence identifier.")


def list_evidence(
    target: Path, change_id: str | None = None, *, verify: bool = False
) -> list[dict[str, Any]]:
    """List evidence, oldest first. An unreadable file is reported, never fatal.

    With `verify=True` every recorded artifact is re-hashed and `hasHashedArtifact` reflects
    what is true now rather than what was true at creation. It is opt-in because it reads every
    referenced file, which `evidence list` has no reason to do; the callers that decide whether
    a gate is supported do.
    """
    target = Path(target).expanduser()
    root = evidence_root(target)
    if not root.is_dir() or root.is_symlink():
        return []

    entries: list[dict[str, Any]] = []
    if change_id is None:
        directories = [item for item in sorted(root.iterdir()) if item.is_dir()]
    else:
        try:
            directories = [change_root(target, change_id)]
        except (UnsafeIdentifierError, UnsafePathError):
            return []

    for directory in directories:
        if not directory.is_dir() or directory.is_symlink():
            continue
        if not IDENTIFIER.match(directory.name):
            continue
        for path in sorted(directory.glob("*.json")):
            if path.is_symlink():
                continue
            entries.append(_summarize(path, directory.name, target if verify else None))
    return sorted(entries, key=lambda item: (item.get("createdAt") or "", item["evidenceId"]))


def _summarize(path: Path, directory_name: str, verify_root: Path | None = None) -> dict[str, Any]:
    try:
        document = read_json(path)
    except (OSError, ValueError) as exc:
        return {
            "evidenceId": path.stem,
            "changeId": directory_name,
            "type": None,
            "createdAt": None,
            "result": None,
            "valid": False,
            "path": str(path),
            "error": str(exc),
        }

    errors = validate_evidence(document)
    # Identity must agree with the filesystem, or the document cannot be trusted to describe
    # the change it is filed under.
    if isinstance(document, dict):
        if document.get("changeId") != directory_name or document.get("evidenceId") != path.stem:
            errors = errors + [
                _error(
                    "EVIDENCE_IDENTITY_MISMATCH",
                    "The document identity does not match its location",
                    "$.evidenceId",
                )
            ]
    # Carry the proof signals rather than the whole document: a consumer deciding whether a
    # gate is supported needs to know an executed command or a hashed artifact exists, without
    # loading every record into memory.
    commands = document.get("commands") if isinstance(document, dict) else None
    artifacts = document.get("artifacts") if isinstance(document, dict) else None
    executed = any(
        isinstance(entry, dict) and entry.get("status") == "passed"
        for entry in (commands if isinstance(commands, list) else [])
    )
    recorded_artifacts = artifacts if isinstance(artifacts, list) else []
    if verify_root is None:
        # A hash present in the document. Enough to describe the record, not to certify a gate.
        statuses = [
            "unchecked"
            if isinstance(entry, dict) and isinstance(entry.get("sha256"), str) and entry.get("sha256")
            else "unhashed"
            for entry in recorded_artifacts
        ]
        hashed = "unchecked" in statuses
    else:
        statuses = [verify_artifact(verify_root, entry) for entry in recorded_artifacts]
        hashed = "verified" in statuses

    source = document.get("source") if isinstance(document, dict) else None
    source = source if isinstance(source, dict) else {}

    return {
        "evidenceId": document.get("evidenceId", path.stem) if isinstance(document, dict) else path.stem,
        "changeId": directory_name,
        "type": document.get("type") if isinstance(document, dict) else None,
        "createdAt": document.get("createdAt") if isinstance(document, dict) else None,
        "result": document.get("result") if isinstance(document, dict) else None,
        "hasExecutedCommand": executed,
        "hasHashedArtifact": hashed,
        "artifactStatuses": sorted(set(statuses)),
        # Carried so a consumer can decide whether the evidence still describes the tree it was
        # produced against. Deciding that needs the observed Git state, which lives elsewhere.
        "sourceCommit": source.get("commit"),
        "sourceDirty": source.get("dirty"),
        "valid": not errors,
        "path": str(path),
    }


def latest_evidence(
    target: Path, change_id: str, *, evidence_type: str | None = None
) -> dict[str, Any] | None:
    entries = [item for item in list_evidence(target, change_id) if item.get("valid")]
    if evidence_type:
        entries = [item for item in entries if item.get("type") == evidence_type]
    return entries[-1] if entries else None


# ---------------------------------------------------------------------------
# Rendering.
# ---------------------------------------------------------------------------


def format_list(entries: list[dict[str, Any]]) -> str:
    if not entries:
        return "No evidence is recorded."
    lines = [f"{'CREATED':<22} {'TYPE':<14} {'RESULT':<14} EVIDENCE"]
    for entry in entries:
        marker = "" if entry.get("valid") else "  (invalid)"
        lines.append(
            f"{entry.get('createdAt') or 'unknown':<22} "
            f"{entry.get('type') or 'unknown':<14} "
            f"{entry.get('result') or 'unknown':<14} "
            f"{entry['evidenceId']}{marker}"
        )
    return "\n".join(lines)


def format_show(document: dict[str, Any]) -> str:
    source = document.get("source") if isinstance(document.get("source"), dict) else {}
    lines = [
        f"Evidence: {document.get('evidenceId')}",
        f"Change: {document.get('changeId')}",
        f"Type: {document.get('type')}",
        f"Created: {document.get('createdAt')}",
        f"Result: {document.get('result')}",
        f"Branch: {source.get('branch') or 'none observed'}",
        f"Commit: {source.get('commit') or 'none observed'}",
        f"Dirty: {source.get('dirty')}",
    ]
    for command in document.get("commands") or []:
        if isinstance(command, dict):
            lines.append(f"Command: {command.get('command')} -> {command.get('status')}")
    for artifact in document.get("artifacts") or []:
        if isinstance(artifact, dict):
            lines.append(f"Artifact: {artifact.get('path')} ({str(artifact.get('sha256'))[:12]}...)")
    for risk in document.get("remainingRisks") or []:
        lines.append(f"Remaining risk: {risk}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI.
# ---------------------------------------------------------------------------


def _add_common(parser: argparse.ArgumentParser) -> None:
    add_target_arguments(parser)
    parser.add_argument("--json", action="store_true", dest="as_json")


# The actions that answer a question about a project that must already exist. `create` is
# absent because it builds the tree it writes into.
READING_COMMANDS = ("list", "show", "validate", "latest")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    creator = subparsers.add_parser("create", help="Record one evidence document")
    _add_common(creator)
    creator.add_argument("--change", required=True, dest="change_id")
    creator.add_argument("--type", required=True, dest="evidence_type", choices=EVIDENCE_TYPES)
    creator.add_argument("--result", choices=RESULTS, default=None)
    creator.add_argument("--requirements", default="")
    creator.add_argument("--command", action="append", dest="commands", default=[])
    creator.add_argument("--artifact", action="append", dest="artifacts", default=[])
    creator.add_argument("--risk", action="append", dest="risks", default=[])
    creator.add_argument(
        "--run",
        action="store_true",
        help="Execute the declared commands without a shell and record their verdict; "
        "without it they are recorded as not_run. Execution is not sandboxed.",
    )

    lister = subparsers.add_parser("list", help="List recorded evidence")
    _add_common(lister)
    lister.add_argument("--change", dest="change_id", default=None)

    shower = subparsers.add_parser("show", help="Show one evidence document")
    _add_common(shower)
    shower.add_argument("evidence_id", metavar="EVIDENCE")
    shower.add_argument("--change", dest="change_id", default=None)

    validator = subparsers.add_parser("validate", help="Validate every recorded evidence document")
    _add_common(validator)
    validator.add_argument("--change", dest="change_id", default=None)

    latest = subparsers.add_parser("latest", help="Show the most recent evidence for a change")
    _add_common(latest)
    latest.add_argument("--change", required=True, dest="change_id")
    latest.add_argument("--type", dest="evidence_type", choices=EVIDENCE_TYPES, default=None)

    args = parser.parse_args()
    command = f"evidence.{args.command}"

    try:
        target = resolve_target_argument(args.target_positional, args.target_option)
    except ValueError as exc:
        return refuse(command, "TARGET_INVALID", str(exc), as_json=args.as_json)

    if args.command in READING_COMMANDS and not target.is_dir():
        # Reading evidence from a path that does not exist reported an empty list and success,
        # which reads as "this project has recorded nothing" rather than "there is no project
        # here". Those are different answers and only one of them is true.
        #
        # `create` is excluded on purpose: it builds the evidence tree it writes into, and has
        # always accepted a directory that does not exist yet. Refusing there would break a
        # working path in the name of fixing a reading one.
        return refuse(
            command,
            "EVIDENCE_TARGET_MISSING",
            f"VibeSpec found no directory to inspect: {target}",
            as_json=args.as_json,
            path=str(target),
            suggestion="Check the path, or pass the project directory explicitly.",
        )

    try:
        return _dispatch(args, command, target)
    except (FileNotFoundError, NotADirectoryError, FileExistsError, ValueError) as exc:
        return refuse(command, "EVIDENCE_REFUSED", str(exc), as_json=args.as_json)


def _find(target: Path, evidence_id: str, change_id: str | None) -> Path | None:
    for entry in list_evidence(target, change_id):
        if entry["evidenceId"] == evidence_id:
            return Path(entry["path"])
    return None


def _dispatch(args: argparse.Namespace, command: str, target: Path) -> int:
    if args.command == "create":
        path = create_evidence(
            target,
            change_id=args.change_id,
            evidence_type=args.evidence_type,
            result=args.result,
            requirements=parse_csv(args.requirements),
            commands=args.commands,
            artifacts=args.artifacts,
            risks=args.risks,
            run=args.run,
        )
        document = read_evidence(path)
        return emit(
            envelope(command, result={"path": str(path), "evidence": document}),
            as_json=args.as_json,
            human=format_show(document),
        )

    if args.command == "list":
        entries = list_evidence(target, args.change_id)
        return emit(
            envelope(command, result={"evidence": entries}),
            as_json=args.as_json,
            human=format_list(entries),
        )

    if args.command == "show":
        path = _find(target, args.evidence_id, args.change_id)
        if path is None:
            payload = envelope(
                command,
                errors=[error("EVIDENCE_NOT_FOUND", f"No evidence matches: {args.evidence_id}")],
            )
            return emit(payload, as_json=args.as_json)
        try:
            document = read_evidence(path)
        except (OSError, ValueError) as exc:
            payload = envelope(command, errors=[error("EVIDENCE_UNREADABLE", str(exc), path=str(path))])
            return emit(payload, as_json=args.as_json)
        # Render only after proving the structure, so a malformed document reports rather
        # than crashing a formatter.
        errors = validate_evidence(document)
        if errors:
            payload = envelope(command, errors=errors)
            return emit(payload, as_json=args.as_json)
        return emit(
            envelope(command, result=document), as_json=args.as_json, human=format_show(document)
        )

    if args.command == "validate":
        entries = list_evidence(target, args.change_id)
        errors: list[dict[str, str]] = []
        for entry in entries:
            if entry.get("valid"):
                continue
            try:
                document = read_json(Path(entry["path"]))
            except (OSError, ValueError) as exc:
                errors.append(error("EVIDENCE_UNREADABLE", str(exc), path=entry["path"]))
                continue
            for item in validate_evidence(document):
                errors.append(
                    error(item["code"], f"{entry['evidenceId']}: {item['message']}", path=item.get("path"))
                )
            if not validate_evidence(document):
                errors.append(
                    error(
                        "EVIDENCE_IDENTITY_MISMATCH",
                        f"{entry['evidenceId']}: the document identity does not match its location",
                        path=entry["path"],
                    )
                )
        payload = envelope(
            command,
            result={"checked": len(entries)} if not errors else None,
            errors=errors,
        )
        human = f"Validated {len(entries)} evidence document(s)." if not errors else ""
        return emit(payload, as_json=args.as_json, human=human)

    if args.command == "latest":
        entry = latest_evidence(target, args.change_id, evidence_type=args.evidence_type)
        if entry is None:
            payload = envelope(
                command,
                errors=[error("EVIDENCE_NOT_FOUND", f"No evidence recorded for change: {args.change_id}")],
            )
            return emit(payload, as_json=args.as_json)
        document = read_evidence(Path(entry["path"]))
        errors = validate_evidence(document)
        if errors:
            return emit(envelope(command, errors=errors), as_json=args.as_json)
        return emit(
            envelope(command, result=document), as_json=args.as_json, human=format_show(document)
        )

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
