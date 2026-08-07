#!/usr/bin/env python3
"""Skill inventory, lock, verification, and deterministic evaluation.

The lock this module writes is read by `drift.py`, which shipped `DRIFT_SKILLS_INVENTORY` in
the previous change against a document nothing produced yet. That makes the schema an
obligation rather than a choice: an entry must carry `name` and an `agents` list holding names
`AGENT_SKILL_ROOTS` can resolve, or the drift rule compares two things that can never match and
becomes permanent noise. tests/test_skill_inventory.py asserts that a freshly written lock
produces no drift on the project that wrote it.

Evaluation is lexical and never calls a model. The same file always produces the same verdict,
on every platform, offline — which is what lets CI gate on it. The limit is real and stated in
the documentation: these checks measure form, not quality.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from vibespec_atomic import write_json  # noqa: E402
from vibespec_common import add_target_arguments, resolve_target_argument  # noqa: E402
from vibespec_json import emit, envelope, error, exit_code  # noqa: E402

class UnsafePathError(ValueError):
    """A path leaves the project, or reaches it through a link."""


LOCK_RELATIVE = ".vibespec/skills.lock.json"
SCHEMA_VERSION = 1
DEFINITION = "SKILL.md"

# Agent name to skill root, kept identical to drift.AGENT_SKILL_ROOTS. A test asserts the two
# agree; duplicating the mapping is deliberate so this module stays importable from inside a
# cloud bundle where drift.py may not have been vendored.
AGENT_SKILL_ROOTS = {
    "codex": ".agents/skills",
    "hermes": ".agents/skills",
    "claude": ".claude/skills",
    "generic": ".vibespec/agent-skills",
}

# ---------------------------------------------------------------------------
# Evaluation vocabulary.
# ---------------------------------------------------------------------------

EVALUATION_CODES = (
    "SKILL_FRONTMATTER_MISSING",
    "SKILL_NAME_MISMATCH",
    "SKILL_DESCRIPTION_MISSING",
    "SKILL_BODY_TOO_SHORT",
    "SKILL_NO_HEADINGS",
    "SKILL_NO_ACTIONABLE_STEP",
    "SKILL_BUDGET_EXCEEDED",
    "SKILL_UNRESOLVED_PLACEHOLDER",
)

EVALUATION_SEVERITIES = {
    "SKILL_FRONTMATTER_MISSING": "error",
    "SKILL_NAME_MISMATCH": "error",
    "SKILL_DESCRIPTION_MISSING": "error",
    "SKILL_BODY_TOO_SHORT": "warning",
    "SKILL_NO_HEADINGS": "warning",
    "SKILL_NO_ACTIONABLE_STEP": "warning",
    "SKILL_BUDGET_EXCEEDED": "warning",
    "SKILL_UNRESOLVED_PLACEHOLDER": "error",
}

EVALUATION_EXPLANATIONS = {
    "SKILL_FRONTMATTER_MISSING": (
        "The definition has no YAML frontmatter, so no agent can read its name or description.",
        "Add a --- delimited block at the top of SKILL.md.",
    ),
    "SKILL_NAME_MISMATCH": (
        "The declared name differs from the directory the skill lives in.",
        "Rename one of them; an agent resolves the skill by directory and reports it by name.",
    ),
    "SKILL_DESCRIPTION_MISSING": (
        "There is no usable description, so nothing tells an agent when this skill applies.",
        "Write one sentence saying when to reach for it.",
    ),
    "SKILL_BODY_TOO_SHORT": (
        "The body is too short to carry a procedure. This usually means a stub or a truncation.",
        "Either finish it or remove it; a skill nobody can follow is worse than none.",
    ),
    "SKILL_NO_HEADINGS": (
        "The body has no headings, so an agent reading under a budget cannot skim it.",
        "Break it into sections.",
    ),
    "SKILL_NO_ACTIONABLE_STEP": (
        "The body contains no step, list item, or imperative an agent could act on.",
        "Say what to do, not only what is true.",
    ),
    "SKILL_BUDGET_EXCEEDED": (
        "The definition is over the per-skill character budget and will crowd the context.",
        "Split it, or move reference material into a linked document.",
    ),
    "SKILL_UNRESOLVED_PLACEHOLDER": (
        "A template marker was left in the definition, so it was never finished.",
        "Replace the placeholder, or delete the section it belongs to.",
    ),
}

# Thresholds, named so a reader can disagree with them explicitly rather than hunt for a literal.
MINIMUM_DESCRIPTION_CHARACTERS = 20
MINIMUM_BODY_CHARACTERS = 200
SKILL_CHARACTER_BUDGET = 12000

_FRONTMATTER = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)
_HEADING = re.compile(r"^#{1,6}\s+\S", re.MULTILINE)
_ACTIONABLE = re.compile(r"^\s*(?:[-*+]\s+\S|\d+[.)]\s+\S)", re.MULTILINE)
_PLACEHOLDER = re.compile(r"\b(?:TODO|FIXME|XXX)\b|<[A-Z][A-Z0-9_ ]{2,}>")


# ---------------------------------------------------------------------------
# Inventory.
# ---------------------------------------------------------------------------


def declared_agents(target: Path) -> list[str]:
    """Return the agents this project declared, in a stable order.

    The filesystem cannot answer which agent a skill was installed for: Codex and Hermes share
    `.agents/skills`, so a directory listing is one-to-many in the wrong direction. The project
    already declared the answer at install time, and inventing the missing half is exactly the
    mistake that produced the namespace defect this module has to avoid repeating.
    """
    lock_path = target / ".vibespec/lock.json"
    if not lock_path.is_file():
        return []
    try:
        lock = json.loads(lock_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    if not isinstance(lock, dict):
        return []
    agents = lock.get("agents")
    if not isinstance(agents, list):
        return []
    return sorted({name for name in agents if name in AGENT_SKILL_ROOTS})


def contained(target: Path, relative: str) -> Path:
    """Resolve one project-relative path and prove it stays inside, or raise.

    Every component is checked, not only the last. A leaf check misses the shape that matters:
    `.agents` pointing outside with a real `skills/` underneath it. `target/".agents/skills"` is
    then not a link at all, so nothing looks wrong while the read happens outside the project.

    Links are refused even when they resolve back inside. Deciding per link where it points
    would make the rule depend on the answer; refusing them outright is what cannot be got
    around, and nothing in a normal installation needs one.
    """
    root = Path(target).expanduser().resolve()
    candidate = root
    for part in PurePosixPath(relative).parts:
        candidate = candidate / part
        if candidate.is_symlink():
            raise UnsafePathError(
                f"VibeSpec refused a path that reaches the project through a link.\n"
                f"\nPath:\n  {candidate}\n"
                f"\nReason:\n  A link can point anywhere. Reading or writing through one is\n"
                f"  not an operation on this project."
            )
    try:
        resolved = candidate.resolve()
    except (OSError, RuntimeError) as exc:
        raise UnsafePathError(f"VibeSpec could not resolve {candidate}: {exc}") from exc
    if resolved != root and root not in resolved.parents:
        raise UnsafePathError(f"VibeSpec refused a path outside the project: {resolved}")
    return candidate


def _contained_or_none(target: Path, relative: str) -> Path | None:
    """The reading form: an unsafe path is skipped rather than fatal.

    Listing must not abort because one directory is a link — the rest of the project is still
    readable, and refusing to report any of it would be a worse answer than reporting the part
    that is genuinely inside.
    """
    try:
        return contained(target, relative)
    except UnsafePathError:
        return None


def _definition(target: Path, root: str, name: str) -> Path | None:
    """Return the definition file of a skill directory, or None when there is not one."""
    directory = _contained_or_none(target, f"{root}/{name}")
    if directory is None or not directory.is_dir():
        return None
    definition = _contained_or_none(target, f"{root}/{name}/{DEFINITION}")
    if definition is None or not definition.is_file():
        return None
    return definition


def collect_inventory(target: Path) -> dict[str, Any]:
    """Describe every skill installed under a known root. Reads, never writes."""
    target = Path(target).expanduser().resolve()
    agents = declared_agents(target)

    found: dict[str, dict[str, Any]] = {}
    for root in sorted(set(AGENT_SKILL_ROOTS.values())):
        directory = _contained_or_none(target, root)
        if directory is None or not directory.is_dir():
            continue
        for item in sorted(directory.iterdir()):
            definition = _definition(target, root, item.name)
            if definition is None:
                continue
            try:
                content = definition.read_bytes()
            except OSError:
                continue
            entry = found.setdefault(
                item.name, {"name": item.name, "agents": [], "definitions": []}
            )
            # One record per root, not per name. The installer copies one source into every
            # root, so the copies normally agree — but nothing enforces that, and collapsing
            # them onto a single hash made the lock blind exactly where it exists to see: a
            # definition edited under one agent's root and not the other stayed invisible.
            entry["definitions"].append(
                {
                    "root": root,
                    "sha256": hashlib.sha256(content).hexdigest(),
                    "sizeBytes": len(content),
                }
            )
            # Only an agent this project declared, and whose root actually holds the skill,
            # is attributed. Both halves are necessary; either alone is a guess.
            entry["agents"].extend(
                agent for agent in agents if AGENT_SKILL_ROOTS[agent] == root
            )

    skills = []
    for entry in sorted(found.values(), key=lambda item: item["name"]):
        definitions = sorted(entry["definitions"], key=lambda item: item["root"])
        hashes = {item["sha256"] for item in definitions}
        skills.append(
            {
                "name": entry["name"],
                "agents": sorted(set(entry["agents"])),
                "roots": sorted({item["root"] for item in definitions}),
                # Null rather than an arbitrary pick when the roots disagree: reporting one of
                # two different files as "the" hash would be a claim the tree does not support.
                "sha256": definitions[0]["sha256"] if len(hashes) == 1 else None,
                "sizeBytes": definitions[0]["sizeBytes"] if len(hashes) == 1 else None,
                "divergent": len(hashes) > 1,
                "definitions": definitions,
            }
        )
    return {"skills": skills}


def source_version() -> str:
    for candidate in (SCRIPT_DIR.parent / "manifest.json", SCRIPT_DIR.parent / "bundle/manifest.json"):
        if candidate.is_file():
            try:
                return str(json.loads(candidate.read_text(encoding="utf-8")).get("version", "unknown"))
            except (OSError, ValueError):
                continue
    return "unknown"


def _distribution(target: Path) -> str:
    if (target / ".vibespec/bundle").is_dir():
        return "cloud-bundle"
    if (target / ".vibespec/pack").is_dir():
        return "repository-local"
    return "global-user"


# The one format `generatedAt` is written in, and therefore the only one accepted when reading
# it back. Shared so the writer and the validator cannot disagree about what a timestamp is.
LOCK_TIMESTAMP_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


def build_lock(target: Path) -> dict[str, Any]:
    """Assemble the lock document. Pure apart from reading the project and the clock."""
    target = Path(target).expanduser().resolve()
    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": datetime.now(timezone.utc).strftime(LOCK_TIMESTAMP_FORMAT),
        "vibespec": {"version": source_version(), "distribution": _distribution(target)},
        "skills": collect_inventory(target)["skills"],
    }


# The only field that records the run rather than the project, and therefore the only one
# exempt from comparison. Everything else is compared by deriving the field list from the
# document just built, so a field added to `build_lock()` comes under comparison by itself.
#
# The alternative — listing the fields to compare — is two declarations that nothing forces to
# agree, which is the shape of defect this module has already produced more than once.
VOLATILE_LOCK_FIELDS = ("generatedAt",)


def _is_lock_timestamp(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        datetime.strptime(value, LOCK_TIMESTAMP_FORMAT)
    except ValueError:
        return False
    return True


def _already_current(existing: Any, document: dict[str, Any]) -> bool:
    """Whether the lock on disk is already this document, apart from when it was stamped.

    Comparing only the fields that carry meaning was not enough. A readable document with the
    right `skills` but no `generatedAt` at all — or with a number in it, or with a foreign
    top-level key someone added — matched, and was then preserved for as long as the tree did
    not change. Idempotence has to mean *this file is already what we would write*, not *the
    parts of it I chose to look at agree*.

    So the key set must match exactly, which rejects both a missing field and an extra one, and
    the timestamp must actually be a timestamp. The lock is a generated file; a foreign key
    surviving regeneration would make it a place where arbitrary data hides from the tool that
    owns it.
    """
    if not isinstance(existing, dict) or existing.keys() != document.keys():
        return False
    if not _is_lock_timestamp(existing.get("generatedAt")):
        return False
    return all(
        existing[field] == document[field]
        for field in document
        if field not in VOLATILE_LOCK_FIELDS
    )


def write_lock(target: Path) -> Path:
    """Write `.vibespec/skills.lock.json`, or leave it alone when nothing it records changed.

    The destination is proven contained before anything is built or created: a `.vibespec` that
    is a link would otherwise have the lock land outside the project entirely.

    Writing is idempotent. Stamping the current clock on every run made two regenerations of an
    unchanged tree differ by their timestamp alone, which contradicts the stated contract and
    produces Git churn that makes the lock harder to review — a file that changes when nothing
    did trains people to stop reading its diff.

    So `generatedAt` records when the inventory last *changed*, not when the command last ran.
    That is both the honest reading and the more useful one.

    Idempotence never preserves a damaged file: see `_already_current()` for what has to hold
    before the existing one is left alone.
    """
    target = Path(target).expanduser().resolve()
    path = contained(target, LOCK_RELATIVE)
    document = build_lock(target)

    if _already_current(read_lock(target), document):
        return path

    write_json(path, document)
    return path


def read_lock(target: Path) -> dict[str, Any] | None:
    path = _contained_or_none(Path(target).expanduser().resolve(), LOCK_RELATIVE)
    if path is None or not path.is_file():
        return None
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return document if isinstance(document, dict) else {}


def verify_lock(target: Path) -> dict[str, Any]:
    """Compare the lock against the skills on disk. Writes nothing.

    An absent or unreadable lock is reported rather than raised: this is what CI calls, and a
    traceback tells someone less than a named condition does.
    """
    target = Path(target).expanduser().resolve()
    document = read_lock(target)
    observed = {entry["name"]: entry for entry in collect_inventory(target)["skills"]}

    if document is None:
        return _verification(False, True, False, [], sorted(observed), [])
    if not document or not isinstance(document.get("skills"), list):
        return _verification(False, False, True, [], sorted(observed), [])

    declared = {
        entry["name"]: entry
        for entry in document["skills"]
        if isinstance(entry, dict) and isinstance(entry.get("name"), str)
    }
    missing = sorted(set(declared) - set(observed))
    unexpected = sorted(set(observed) - set(declared))
    # Compared per root. A single hash per name meant an edit under whichever root sorted
    # second could never be seen, however long it stayed there.
    modified = sorted(
        name
        for name in set(declared) & set(observed)
        if _definition_map(declared[name]) != _definition_map(observed[name])
    )
    return _verification(
        not (missing or unexpected or modified), False, False, missing, unexpected, modified
    )


def _definition_map(entry: dict[str, Any]) -> dict[str, str]:
    """Map each root to the hash recorded for it.

    Falls back to the entry's single hash for a lock written before per-root detail existed, so
    an older lock still compares rather than reporting every skill as modified.
    """
    definitions = entry.get("definitions")
    if isinstance(definitions, list) and definitions:
        return {
            str(item.get("root")): str(item.get("sha256"))
            for item in definitions
            if isinstance(item, dict)
        }
    return {root: str(entry.get("sha256")) for root in entry.get("roots") or [""]}


def _verification(
    match: bool,
    lock_missing: bool,
    lock_invalid: bool,
    missing: list[str],
    unexpected: list[str],
    modified: list[str],
) -> dict[str, Any]:
    return {
        "match": match,
        "lockMissing": lock_missing,
        "lockInvalid": lock_invalid,
        "missing": missing,
        "unexpected": unexpected,
        "modified": modified,
    }


# ---------------------------------------------------------------------------
# Deterministic evaluation.
# ---------------------------------------------------------------------------


def parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    """Split a definition into its frontmatter fields and its body.

    A deliberately small reader: `key: value` pairs only, no nesting, no YAML dependency. A
    skill definition that needs more structure than this is already too clever for a file whose
    job is to be read under a context budget.
    """
    match = _FRONTMATTER.match(text)
    if not match:
        return {}, text
    fields: dict[str, str] = {}
    for line in match.group(1).splitlines():
        if ":" not in line or line.lstrip().startswith("#"):
            continue
        key, _, value = line.partition(":")
        fields[key.strip()] = value.strip().strip("\"'")
    return fields, text[match.end():]


def evaluate_definition(name: str, text: str) -> list[dict[str, Any]]:
    """Evaluate one skill definition. Pure: same input, same findings, on every platform."""
    findings: list[dict[str, Any]] = []

    def report(code: str, observed: str) -> None:
        findings.append(
            {
                "code": code,
                "severity": EVALUATION_SEVERITIES[code],
                "skill": name,
                "observed": observed,
                "message": EVALUATION_EXPLANATIONS[code][0],
                "suggestion": EVALUATION_EXPLANATIONS[code][1],
            }
        )

    fields, body = parse_frontmatter(text)
    if not fields:
        report("SKILL_FRONTMATTER_MISSING", "no --- block at the top of the file")
    else:
        declared = fields.get("name", "")
        if declared and declared != name:
            report("SKILL_NAME_MISMATCH", f"declared {declared!r}, directory {name!r}")
        description = fields.get("description", "")
        if len(description) < MINIMUM_DESCRIPTION_CHARACTERS:
            report(
                "SKILL_DESCRIPTION_MISSING",
                f"{len(description)} characters, minimum {MINIMUM_DESCRIPTION_CHARACTERS}",
            )

    stripped = body.strip()
    if len(stripped) < MINIMUM_BODY_CHARACTERS:
        report("SKILL_BODY_TOO_SHORT", f"{len(stripped)} characters, minimum {MINIMUM_BODY_CHARACTERS}")
    if not _HEADING.search(body):
        report("SKILL_NO_HEADINGS", "no Markdown heading")
    if not _ACTIONABLE.search(body):
        report("SKILL_NO_ACTIONABLE_STEP", "no list item or numbered step")
    if len(text) > SKILL_CHARACTER_BUDGET:
        report("SKILL_BUDGET_EXCEEDED", f"{len(text)} characters, budget {SKILL_CHARACTER_BUDGET}")

    found = _PLACEHOLDER.search(text)
    if found:
        report("SKILL_UNRESOLVED_PLACEHOLDER", f"{found.group(0)!r} remains in the definition")

    return sorted(findings, key=lambda item: (item["skill"], item["code"]))


def evaluate_project(target: Path, *, only: str | None = None) -> dict[str, Any]:
    """Evaluate every installed skill, or one of them."""
    target = Path(target).expanduser().resolve()
    findings: list[dict[str, Any]] = []
    evaluated: list[str] = []
    # A set of pairs, not a name-to-digest map. The map kept only the last digest seen, so
    # three roots holding A, B, A evaluated A twice: the B in the middle displaced it. Every
    # distinct content is evaluated exactly once, however many roots repeat it.
    seen: set[tuple[str, str]] = set()

    for root in sorted(set(AGENT_SKILL_ROOTS.values())):
        directory = _contained_or_none(target, root)
        if directory is None or not directory.is_dir():
            continue
        for item in sorted(directory.iterdir()):
            if only is not None and item.name != only:
                continue
            definition = _definition(target, root, item.name)
            if definition is None:
                continue
            try:
                text = definition.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
            if (item.name, digest) in seen:
                # A byte-identical copy under another root is the same file, so evaluating it
                # again would only double every finding it carries.
                continue
            seen.add((item.name, digest))
            if item.name not in evaluated:
                evaluated.append(item.name)
            findings.extend(evaluate_definition(item.name, text))

    counts = {severity: 0 for severity in ("error", "warning")}
    for finding in findings:
        counts[finding["severity"]] += 1
    return {
        "evaluated": sorted(evaluated),
        "findings": sorted(findings, key=lambda item: (item["skill"], item["code"])),
        "summary": {"skills": len(evaluated), **counts},
    }


def explain(code: str) -> dict[str, str]:
    """Describe one evaluation code. An unknown code raises rather than inventing a meaning."""
    meaning, resolution = EVALUATION_EXPLANATIONS[code]
    return {
        "code": code,
        "severity": EVALUATION_SEVERITIES[code],
        "meaning": meaning,
        "resolution": resolution,
    }


# ---------------------------------------------------------------------------
# Rendering and CLI.
# ---------------------------------------------------------------------------


def format_inventory(result: dict[str, Any]) -> str:
    skills = result["skills"]
    if not skills:
        return "No VibeSpec skills are installed."
    lines = [f"{'SKILL':34} {'AGENTS':22} ROOTS"]
    for entry in skills:
        agents = ", ".join(entry["agents"]) or "—"
        lines.append(f"{entry['name']:34} {agents:22} {', '.join(entry['roots'])}")
    return "\n".join(lines)


def format_verification(result: dict[str, Any]) -> str:
    if result["lockMissing"]:
        return "No skill lock. Write one with: vibespec skill lock"
    if result["lockInvalid"]:
        return "The skill lock could not be read. Rewrite it with: vibespec skill lock"
    if result["match"]:
        return "The skill lock matches the skills on disk."
    lines = ["The skill lock does not match the skills on disk.", ""]
    for label, key in (("Missing", "missing"), ("Unexpected", "unexpected"), ("Modified", "modified")):
        if result[key]:
            lines.append(f"{label}: {', '.join(result[key])}")
    lines.append("")
    lines.append("Reinstall the skills, or regenerate with: vibespec skill lock")
    return "\n".join(lines)


def format_evaluation(result: dict[str, Any]) -> str:
    summary = result["summary"]
    lines = [
        "VibeSpec skill evaluation",
        "",
        f"Skills:   {summary['skills']}",
        f"Errors:   {summary['error']}",
        f"Warnings: {summary['warning']}",
    ]
    for finding in result["findings"]:
        lines.extend(
            [
                "",
                f"[{finding['severity'].upper()}] {finding['code']}",
                f"  Skill:    {finding['skill']}",
                f"  Observed: {finding['observed']}",
                f"  {finding['message']}",
                f"  {finding['suggestion']}",
            ]
        )
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="vibespec skill", description="Skill inventory and evaluation.")
    sub = parser.add_subparsers(dest="action", required=True)

    for name, help_text in (
        ("inventory", "list the skills installed in a project"),
        ("lock", "write .vibespec/skills.lock.json"),
        ("verify", "compare the lock against the skills on disk"),
    ):
        action = sub.add_parser(name, help=help_text)
        add_target_arguments(action)
        action.add_argument("--json", action="store_true", dest="as_json")

    evaluate = sub.add_parser("eval", help="evaluate skill definitions without a model")
    add_target_arguments(evaluate)
    evaluate.add_argument("--skill", help="evaluate one skill by name")
    evaluate.add_argument("--strict", action="store_true", help="treat warnings as failure")
    evaluate.add_argument("--json", action="store_true", dest="as_json")

    describe = sub.add_parser("explain", help="describe one evaluation code")
    describe.add_argument("code")
    describe.add_argument("--json", action="store_true", dest="as_json")
    return parser


def main(argv: list[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    command = f"skill {arguments.action}"

    if arguments.action == "explain":
        if arguments.code not in EVALUATION_EXPLANATIONS:
            payload = envelope(
                command,
                errors=[
                    error(
                        "SKILL_UNKNOWN_CODE",
                        f"Unknown evaluation code: {arguments.code}",
                        suggestion="Known codes: " + ", ".join(EVALUATION_CODES),
                    )
                ],
            )
            return emit(payload, as_json=arguments.as_json, human="")
        described = explain(arguments.code)
        human = "\n".join(
            [
                f"{described['code']} ({described['severity']})",
                "",
                described["meaning"],
                "",
                described["resolution"],
            ]
        )
        return emit(envelope(command, result=described), as_json=arguments.as_json, human=human)

    try:
        target = resolve_target_argument(arguments.target_positional, arguments.target_option)
    except UnsafePathError as exc:
        payload = envelope(command, errors=[error("SKILL_UNSAFE_PATH", str(exc))])
        emit(payload, as_json=arguments.as_json, human="")
        return 2
    except ValueError as exc:
        payload = envelope(command, errors=[error("TARGET_CONFLICT", str(exc))])
        emit(payload, as_json=arguments.as_json, human="")
        return 2

    if not target.is_dir():
        # "The target cannot be read" covers a target that is not there at all. Reporting an
        # empty inventory instead made a path that does not exist indistinguishable from a real
        # project with no skills installed, which is the fail-open reading of a question whose
        # whole point is to compare what is declared against what is actually present.
        payload = envelope(
            command,
            errors=[
                error(
                    "SKILL_TARGET_MISSING",
                    f"VibeSpec found no directory to inspect: {target}",
                    path=str(target),
                    suggestion="Check the path, or pass the project directory explicitly.",
                )
            ],
        )
        emit(payload, as_json=arguments.as_json, human="")
        return 2

    # Everything below touches the filesystem. The documented contract is exit 2 with a
    # structured envelope when the target cannot be read or written; catching only the target
    # resolution left every other failure — a `.vibespec` that is a file, a lock path that is a
    # directory — escaping as a traceback, including under --json where a caller cannot read it.
    try:
        return _dispatch(command, arguments, target)
    except UnsafePathError as exc:
        payload = envelope(command, errors=[error("SKILL_UNSAFE_PATH", str(exc))])
        emit(payload, as_json=arguments.as_json, human="")
        return 2
    except OSError as exc:
        payload = envelope(
            command,
            errors=[
                error(
                    "SKILL_FILESYSTEM_ERROR",
                    f"The project could not be read or written: {exc}",
                    path=str(getattr(exc, "filename", "") or target),
                    suggestion="Check the path exists and that you can read and write it.",
                )
            ],
        )
        emit(payload, as_json=arguments.as_json, human="")
        return 2


def _dispatch(command: str, arguments: argparse.Namespace, target: Path) -> int:
    """Run one action. Filesystem failures propagate to the single handler in main()."""

    if arguments.action == "inventory":
        result = collect_inventory(target)
        return emit(envelope(command, result=result), as_json=arguments.as_json,
                    human=format_inventory(result))

    if arguments.action == "lock":
        # Read the document back rather than building a second one. The two agreed only while
        # both calls landed in the same second, so `--json` could describe a file that is not
        # the one on disk.
        path = write_lock(target)
        result = {"path": str(path), **(read_lock(target) or {})}
        return emit(
            envelope(command, result=result),
            as_json=arguments.as_json,
            human=f"Wrote {len(result['skills'])} skill(s) to {path}",
        )

    if arguments.action == "verify":
        result = verify_lock(target)
        payload = envelope(command, result=result)
        code = emit(payload, as_json=arguments.as_json, human=format_verification(result))
        return code if result["match"] else 1

    result = evaluate_project(target, only=arguments.skill)
    payload = envelope(command, result=result)
    emit(payload, as_json=arguments.as_json, human=format_evaluation(result))
    if result["summary"]["error"]:
        return 1
    if arguments.strict and result["summary"]["warning"]:
        return 1
    return exit_code(payload)


if __name__ == "__main__":
    raise SystemExit(main())
