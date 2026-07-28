#!/usr/bin/env python3
"""Shared helpers for VibeSpec global and project lifecycle commands."""

from __future__ import annotations

import json
import os
import re
import shutil
from pathlib import Path
from typing import Any

BEGIN = "<!-- BEGIN VIBESPEC -->"
END = "<!-- END VIBESPEC -->"


def parse_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def global_root(home: Path | None = None) -> Path:
    override = os.environ.get("VIBESPEC_HOME")
    if override:
        return Path(override).expanduser().resolve()
    base = (home or Path.home()).expanduser().resolve()
    return base / ".vibespec"


def remove_path(path: Path) -> None:
    if path.is_symlink() or path.is_file():
        path.unlink(missing_ok=True)
    elif path.is_dir():
        shutil.rmtree(path)


def copy_path(source: Path, destination: Path, *, replace: bool = True) -> None:
    if destination.exists() or destination.is_symlink():
        if not replace:
            return
        remove_path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.is_dir():
        shutil.copytree(source, destination)
    else:
        shutil.copy2(source, destination)


def upsert_managed_block(path: Path, body: str, *, dry_run: bool) -> None:
    body = body.strip()
    block = f"{BEGIN}\n{body}\n{END}"
    existing = path.read_text(encoding="utf-8") if path.exists() else ""
    pattern = re.compile(re.escape(BEGIN) + r".*?" + re.escape(END), re.DOTALL)
    if pattern.search(existing):
        updated = pattern.sub(block, existing, count=1)
    elif existing.strip():
        updated = existing.rstrip() + "\n\n" + block + "\n"
    else:
        updated = block + "\n"
    if dry_run:
        print(f"UPDATE {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(updated, encoding="utf-8")


def remove_managed_block(path: Path, *, dry_run: bool) -> None:
    if not path.exists():
        return
    existing = path.read_text(encoding="utf-8")
    pattern = re.compile(r"\n?" + re.escape(BEGIN) + r".*?" + re.escape(END) + r"\n?", re.DOTALL)
    updated = pattern.sub("\n", existing, count=1).strip()
    if dry_run:
        print(f"UPDATE {path}")
        return
    if updated:
        path.write_text(updated + "\n", encoding="utf-8")
    else:
        path.unlink(missing_ok=True)


def _yaml_scalar(value: Any) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value)
    if not text or re.search(r"[:#\[\]{},&*!|>'\"%@`]|^[-?]|\s$|^\s", text):
        return json.dumps(text, ensure_ascii=False)
    return text


def _emit_yaml(value: Any, indent: int = 0) -> list[str]:
    prefix = " " * indent
    lines: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            if isinstance(child, dict):
                if child:
                    lines.append(f"{prefix}{key}:")
                    lines.extend(_emit_yaml(child, indent + 2))
                else:
                    lines.append(f"{prefix}{key}: {{}}")
            elif isinstance(child, list):
                if child:
                    lines.append(f"{prefix}{key}:")
                    lines.extend(_emit_yaml(child, indent + 2))
                else:
                    lines.append(f"{prefix}{key}: []")
            else:
                lines.append(f"{prefix}{key}: {_yaml_scalar(child)}")
    elif isinstance(value, list):
        for item in value:
            if isinstance(item, (dict, list)):
                raise ValueError("nested structured list items are not supported")
            lines.append(f"{prefix}- {_yaml_scalar(item)}")
    else:
        lines.append(f"{prefix}{_yaml_scalar(value)}")
    return lines


def write_project_config(path: Path, config: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(_emit_yaml(config)) + "\n", encoding="utf-8")


def _parse_scalar(value: str) -> Any:
    value = value.strip()
    if value == "null":
        return None
    if value == "true":
        return True
    if value == "false":
        return False
    if value == "[]":
        return []
    if value == "{}":
        return {}
    if value.startswith(('"', "'")):
        if value.startswith('"'):
            return json.loads(value)
        return value[1:-1]
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    if re.fullmatch(r"-?\d+\.\d+", value):
        return float(value)
    return value


def read_project_config(path: Path) -> dict[str, Any]:
    """Parse the intentionally small YAML subset emitted by this pack."""
    root: dict[str, Any] = {}
    stack: list[tuple[int, dict[str, Any]]] = [(-1, root)]
    pending_lists: dict[tuple[int, str], list[Any]] = {}

    lines = path.read_text(encoding="utf-8").splitlines()
    for index, raw in enumerate(lines):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        if indent % 2:
            raise ValueError(f"invalid indentation at line {index + 1}")
        stripped = raw.strip()
        while stack and indent <= stack[-1][0]:
            stack.pop()
        parent = stack[-1][1]
        if stripped.startswith("- "):
            if not pending_lists:
                raise ValueError(f"list item without list key at line {index + 1}")
            candidates = [(key, value) for key, value in pending_lists.items() if key[0] == indent]
            if not candidates:
                raise ValueError(f"list item at unexpected indentation on line {index + 1}")
            candidates[-1][1].append(_parse_scalar(stripped[2:]))
            continue
        if ":" not in stripped:
            raise ValueError(f"invalid mapping at line {index + 1}")
        key, raw_value = stripped.split(":", 1)
        key = key.strip()
        raw_value = raw_value.strip()
        if raw_value:
            parent[key] = _parse_scalar(raw_value)
            continue
        next_nonempty = ""
        next_indent = -1
        for following in lines[index + 1:]:
            if following.strip() and not following.lstrip().startswith("#"):
                next_nonempty = following.strip()
                next_indent = len(following) - len(following.lstrip(" "))
                break
        if next_nonempty.startswith("- ") and next_indent == indent + 2:
            child_list: list[Any] = []
            parent[key] = child_list
            pending_lists[(indent + 2, key)] = child_list
        else:
            child: dict[str, Any] = {}
            parent[key] = child
            stack.append((indent, child))
    return root
