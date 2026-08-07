#!/usr/bin/env python3
"""Atomic JSON persistence.

Every VibeSpec document that a command rewrites goes through here. A half-written
status file or registry is worse than an absent one: the absent case is detectable,
the truncated case looks like corruption of the user's own data.
"""

from __future__ import annotations

import itertools
import json
import os
from pathlib import Path
from typing import Any

_COUNTER = itertools.count()


def read_json(path: Path) -> Any:
    """Read a JSON document.

    Raises FileNotFoundError when absent and ValueError when unparseable, so callers can
    distinguish "nothing here yet" from "something here is broken".
    """
    text = path.read_text(encoding="utf-8")
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path}: {exc}") from exc


def write_json(path: Path, payload: Any, *, private: bool = False) -> None:
    """Write a JSON document atomically.

    Serialization happens before anything touches the filesystem, so a payload that cannot
    be serialized leaves the previous file untouched and creates no temporary artifact.

    The temporary file is created in the destination directory, which keeps os.replace on
    one filesystem and therefore atomic on POSIX and on Windows alike.

    Permissions come from the creation mode, so the OS applies the umask itself. This matters:
    NamedTemporaryFile creates with 0600 and os.replace preserves that mode, so a document
    written through it lands private — including the ones meant to be committed and read by a
    whole team. Reading the umask by setting it to zero and restoring it would fix the mode
    but open a window in which another thread creates a world-readable file, so the mask is
    never touched.
    """
    text = json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n"

    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = _create_temporary(path.parent, path.name, 0o600 if private else 0o666)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def _create_temporary(directory: Path, name: str, mode: int) -> tuple[int, Path]:
    """Create an exclusive temporary file beside the destination, with an explicit mode."""
    for _ in range(100):
        candidate = directory / f".{name}.{os.getpid()}.{next(_COUNTER)}.tmp"
        try:
            return os.open(candidate, os.O_CREAT | os.O_EXCL | os.O_WRONLY, mode), candidate
        except FileExistsError:
            continue
    raise OSError(f"could not create a temporary file in {directory}")
