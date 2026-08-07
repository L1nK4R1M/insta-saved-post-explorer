#!/usr/bin/env python3
"""The stable JSON envelope shared by every VibeSpec command that supports --json.

Consumers such as Hermes, Argos, and CI scripts parse stdout. That only works if stdout
carries the envelope and nothing else, so human text and diagnostics go to stderr whenever
JSON mode is active.
"""

from __future__ import annotations

import json
import sys
from typing import Any, TextIO

SCHEMA_VERSION = 1


def error(code: str, message: str, *, path: str | None = None, suggestion: str | None = None) -> dict[str, str]:
    """Build one diagnostic. Optional fields are omitted rather than emitted as null."""
    payload: dict[str, str] = {"code": code, "message": message}
    if path is not None:
        payload["path"] = path
    if suggestion is not None:
        payload["suggestion"] = suggestion
    return payload


def envelope(
    command: str,
    *,
    result: Any = None,
    warnings: list[dict[str, str]] | None = None,
    errors: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    """Build the response envelope.

    Errors decide success; warnings never do. A failed command reports a null result so a
    consumer cannot mistake a partial computation for an answer.
    """
    collected_errors = list(errors or [])
    success = not collected_errors
    return {
        "schemaVersion": SCHEMA_VERSION,
        "command": command,
        "success": success,
        "result": result if success else None,
        "warnings": list(warnings or []),
        "errors": collected_errors,
    }


def exit_code(payload: dict[str, Any]) -> int:
    """Zero on success, one when the command produced errors."""
    return 0 if payload.get("success") else 1


def render(payload: dict[str, Any]) -> str:
    """Serialize deterministically so two identical runs produce identical bytes."""
    return json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False)


def emit(
    payload: dict[str, Any],
    *,
    as_json: bool,
    human: str = "",
    stdout: TextIO | None = None,
    stderr: TextIO | None = None,
) -> int:
    """Write one response and return the process exit code.

    In JSON mode stdout receives the envelope alone: no banner, no progress line, no
    trailing human summary. Anything else would break `command --json | jq`.
    """
    out = sys.stdout if stdout is None else stdout
    err = sys.stderr if stderr is None else stderr

    if as_json:
        print(render(payload), file=out)
        return exit_code(payload)

    if human:
        print(human, file=out)
    for diagnostic in payload.get("warnings", []):
        print(_format_diagnostic("warning", diagnostic), file=err)
    for diagnostic in payload.get("errors", []):
        print(_format_diagnostic("error", diagnostic), file=err)
    return exit_code(payload)


def refuse(
    command: str,
    code: str,
    message: str,
    *,
    as_json: bool,
    path: str | None = None,
    suggestion: str | None = None,
) -> int:
    """Refuse a command that could not run, in whichever output form the caller asked for.

    Exit 2 rather than 1, because this is "the command could not run" and not "the command
    ran and found problems". `emit` cannot express that: its exit code is derived from the
    envelope's success alone, and both of those conditions produce an unsuccessful envelope.

    Refusals used to print prose to stderr and nothing at all to stdout, even under `--json`.
    That is worse than a traceback. `vibespec drift check --json` on a project with no status
    document left `jq` reading an empty string, which jq treats as no input rather than as an
    error — so the worked example in `docs/json-api.md` concluded "no blocking findings" and
    exited zero, and a CI gate built on it passed a project it never inspected.
    """
    payload = envelope(command, errors=[error(code, message, path=path, suggestion=suggestion)])
    if as_json:
        print(render(payload), file=sys.stdout)
    else:
        print(message, file=sys.stderr)
    return 2


def _format_diagnostic(severity: str, diagnostic: dict[str, str]) -> str:
    location = diagnostic.get("path")
    prefix = f"{severity}: {diagnostic.get('code', 'UNKNOWN')}"
    if location:
        prefix = f"{prefix} at {location}"
    line = f"{prefix}: {diagnostic.get('message', '')}"
    suggestion = diagnostic.get("suggestion")
    if suggestion:
        line = f"{line}\n  {suggestion}"
    return line
