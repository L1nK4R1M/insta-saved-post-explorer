#!/usr/bin/env python3
"""Shared helpers for VibeSpec global and project lifecycle commands."""

from __future__ import annotations

import json
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Any, NamedTuple

BEGIN = "<!-- BEGIN VIBESPEC -->"
END = "<!-- END VIBESPEC -->"


class TargetConflictError(ValueError):
    """Raised when a positional target and its option form designate different paths."""


def fail(message: str) -> int:
    """Report a blocking command error without the argparse usage banner."""
    print(message, file=sys.stderr)
    return 2


def parse_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def _normalize_target(value: str | Path) -> Path:
    """Expand the user prefix and resolve a target path without touching the filesystem."""
    return Path(value).expanduser().resolve()


def resolve_target_argument(
    positional: str | Path | None,
    option: str | Path | None,
    *,
    default: str | Path | None = None,
    option_name: str = "--target",
    metavar: str = "TARGET",
) -> Path:
    """Resolve one project directory from a positional path and its option form.

    Both forms are accepted. When both are supplied they must designate the same
    directory after user expansion and resolution; otherwise the caller is refused
    instead of silently preferring one form. Paths are never split or rewritten, so
    spaces, Unicode characters, and Windows separators survive unchanged.
    """
    resolved_positional = None if positional is None else _normalize_target(positional)
    resolved_option = None if option is None else _normalize_target(option)

    if resolved_positional is not None and resolved_option is not None:
        if resolved_positional != resolved_option:
            raise TargetConflictError(
                "VibeSpec refused to resolve the project target.\n"
                "\n"
                f"Positional {metavar}:\n"
                f"  {resolved_positional}\n"
                "\n"
                f"{option_name}:\n"
                f"  {resolved_option}\n"
                "\n"
                "Reason:\n"
                f"  {metavar} and {option_name} must designate the same project directory.\n"
                "\n"
                "Recommended action:\n"
                f"  Pass the path once, either as {metavar} or as {option_name} PATH."
            )
        return resolved_positional
    if resolved_positional is not None:
        return resolved_positional
    if resolved_option is not None:
        return resolved_option
    if default is not None:
        return _normalize_target(default)
    return Path.cwd().resolve()


def add_target_arguments(
    parser: Any,
    *,
    metavar: str = "TARGET",
    help_text: str = "Project directory; defaults to the current directory",
) -> None:
    """Register the positional and option forms of a project target on a parser."""
    parser.add_argument("target_positional", nargs="?", metavar=metavar, default=None, help=help_text)
    parser.add_argument("--target", dest="target_option", default=None, help=help_text)


def global_root(home: Path | None = None) -> Path:
    if home is None:
        override = os.environ.get("VIBESPEC_HOME")
        if override:
            return Path(override).expanduser().resolve()
    base = (home if home is not None else Path.home()).expanduser().resolve()
    return base / ".vibespec"


class GlobalInvocation(NamedTuple):
    """One resolved lifecycle location; downstream code must not re-read the environment."""

    home: Path
    root: Path
    prefix: Path | None


def read_global_state(state_path: Path) -> dict[str, Any]:
    try:
        state = json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeError) as exc:
        raise ValueError(f"invalid global state {state_path}: {exc}") from exc
    if not isinstance(state, dict):
        raise ValueError(f"invalid global state {state_path}: expected a JSON object")
    return state


def validate_prefix_identity(state: dict[str, Any], root: Path, prefix: Path) -> None:
    """Validate prefix state against the independently derived canonical layout."""
    expected = {
        "prefix": prefix,
        "home": prefix,
        "root": root,
        "bin_dir": prefix / "bin",
    }
    if state.get("install_mode") != "prefix":
        raise ValueError(f"inconsistent prefix state at {root}: install_mode must be prefix")
    for key, expected_path in expected.items():
        value = state.get(key)
        if not isinstance(value, str):
            raise ValueError(f"inconsistent prefix state at {root}: {key} must be a path string")
        try:
            actual = Path(value).expanduser().resolve()
        except (OSError, RuntimeError, TypeError, ValueError) as exc:
            raise ValueError(f"inconsistent prefix state at {root}: invalid {key}") from exc
        if actual != expected_path:
            raise ValueError(f"inconsistent prefix state at {root}: {key} does not match the local prefix")


def _recorded_prefix(root: Path) -> Path | None:
    """Return the validated prefix recorded in root/state.json, or None.

    Only trusted when state.json parses, install_mode is "prefix", and the
    recorded prefix's share/vibespec-pro subdirectory is exactly root — this
    guards against stale or hand-edited state pointing somewhere else.
    """
    state_path = root / "state.json"
    if not state_path.is_file():
        return None
    try:
        state = read_global_state(state_path)
    except ValueError:
        return None
    if not isinstance(state, dict):
        return None
    if "install_mode" not in state:
        # Pre-install_mode legacy state: preserve the historical VIBESPEC_HOME fallback.
        return None
    install_mode = state.get("install_mode")
    if install_mode == "home":
        return None
    if install_mode != "prefix":
        raise ValueError("invalid global state: install_mode must be home or prefix")
    recorded = state.get("prefix")
    if not isinstance(recorded, str) or not recorded:
        return None
    try:
        resolved_prefix = Path(recorded).expanduser().resolve()
        validate_prefix_identity(state, root, resolved_prefix)
    except (OSError, RuntimeError, TypeError, ValueError):
        return None
    if resolved_prefix / "share" / "vibespec-pro" != root:
        return None
    return resolved_prefix


def resolve_global_invocation(
    script_dir: Path,
    *,
    home: Path | None,
    prefix: Path | None,
) -> GlobalInvocation:
    """Resolve the (home, prefix) pair a global lifecycle command should act on.

    Explicit --home/--prefix flags win, in that order. Failing that, VIBESPEC_HOME
    is respected: if it names the root of a recorded prefix install (its
    state.json has install_mode "prefix"), the recorded prefix is returned so a
    shell that exports VIBESPEC_HOME=PREFIX/share/vibespec-pro still resolves to
    the prefix rather than being misread as legacy home-mode. Otherwise
    VIBESPEC_HOME behaves as global_root() already does (home falls back to the
    real user home, prefix stays None). Failing that, a command running from an
    installed root/pack/scripts copy infers its own location from the state.json
    recorded there, so `PREFIX/bin/vibespec.sh update` (and doctor/uninstall) work
    without re-passing --prefix or setting VIBESPEC_HOME.
    """
    if prefix is not None:
        resolved = prefix.expanduser().resolve()
        return GlobalInvocation(resolved, resolved / "share" / "vibespec-pro", resolved)
    if home is not None:
        resolved = home.expanduser().resolve()
        return GlobalInvocation(resolved, resolved / ".vibespec", None)
    env_home = os.environ.get("VIBESPEC_HOME")
    if env_home:
        env_root = Path(env_home).expanduser().resolve()
        recorded_prefix = _recorded_prefix(env_root)
        if recorded_prefix is not None:
            return GlobalInvocation(recorded_prefix, env_root, recorded_prefix)
        return GlobalInvocation(Path.home().expanduser().resolve(), env_root, None)
    if script_dir.name == "scripts" and script_dir.parent.name == "pack":
        root = script_dir.parent.parent.resolve()
        if root.name == "vibespec-pro" and root.parent.name == "share":
            prefix = root.parent.parent.resolve()
            state = read_global_state(root / "state.json")
            validate_prefix_identity(state, root, prefix)
            return GlobalInvocation(prefix, root, prefix)
    resolved_home = Path.home().expanduser().resolve()
    return GlobalInvocation(resolved_home, resolved_home / ".vibespec", None)


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
