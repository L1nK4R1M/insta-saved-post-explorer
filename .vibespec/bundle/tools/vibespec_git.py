#!/usr/bin/env python3
"""Read-only Git observation.

VibeSpec reports what Git says. It never changes what Git holds: no commit, no checkout,
no branch, no push, no config. That guarantee is structural rather than a matter of
discipline. Every invocation comes from ALLOWED_COMMANDS below, each entry is a fixed
argument tuple, and no entry names a verb that writes. tests/test_git_observation.py
asserts that against an explicit denylist, so adding a mutating command fails the suite.

Arguments are always passed as a list and no shell is ever interposed, so a branch or path
containing a space, a quote, or a shell metacharacter cannot be reinterpreted.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any

# Fixed observation commands. Dynamic values are appended as separate argv entries by the
# caller; they never rewrite the verb.
ALLOWED_COMMANDS: dict[str, tuple[str, ...]] = {
    "toplevel": ("git", "rev-parse", "--show-toplevel"),
    "git_dir": ("git", "rev-parse", "--git-dir"),
    "is_bare": ("git", "rev-parse", "--is-bare-repository"),
    "branch": ("git", "rev-parse", "--abbrev-ref", "HEAD"),
    "commit": ("git", "rev-parse", "HEAD"),
    "porcelain": ("git", "status", "--porcelain"),
    "verify_ref": ("git", "rev-parse", "--verify", "--quiet"),
}

_TIMEOUT_SECONDS = 15


class GitUnavailable(RuntimeError):
    """Raised internally when Git cannot answer; callers degrade instead of failing."""


def git_available() -> bool:
    return shutil.which("git") is not None


def observe(target: Path, name: str, *extra: str) -> subprocess.CompletedProcess[str]:
    """Run one allowlisted observation. An unknown name raises KeyError by design."""
    arguments = ALLOWED_COMMANDS[name]
    return subprocess.run(
        [*arguments, *extra],
        cwd=str(target),
        capture_output=True,
        text=True,
        check=False,
        timeout=_TIMEOUT_SECONDS,
    )


# Structured observation outcomes. A caller deciding whether it may trust the absence of a
# repository must not have to pattern-match a human-readable sentence, and the distinctions
# below are not interchangeable: "this is not a repository" is a fact, while "git could not be
# run" is an admission that nothing is known.
OBSERVATION_KINDS = (
    "observed",  # a repository was read, has a commit, and its worktree state is known
    "not_repository",  # confirmed: the directory is not inside a Git repository
    "unborn_repository",  # a repository, but no commit exists yet
    "bare_repository",  # a repository with no work tree to correlate evidence against
    "worktree_unobservable",  # commit known, but `status --porcelain` failed
    "git_missing",  # the git executable is absent, so nothing can be concluded
    "git_failure",  # git was present but could not answer
    "no_directory",  # the target does not exist
)


def _degraded(kind: str, reason: str) -> dict[str, Any]:
    return {
        "available": False,
        "kind": kind,
        "branch": None,
        "commit": None,
        "dirty": None,
        "reason": reason,
    }


def observe_repository(target: Path) -> dict[str, Any]:
    """Describe the Git state of a directory.

    Every outcome carries a `kind` from OBSERVATION_KINDS alongside the human-readable reason.
    The distinction matters to callers: a directory confirmed not to be a repository is a
    supported, knowable state, whereas a missing or failing Git means the answer is simply not
    available. Collapsing the two would let a broken observer look like a supported project.
    """
    if not git_available():
        return _degraded("git_missing", "the git executable was not found on PATH")
    if not target.is_dir():
        return _degraded("no_directory", f"the directory does not exist: {target}")

    try:
        toplevel = observe(target, "toplevel")
        if toplevel.returncode != 0:
            return _classify_toplevel_failure(target, toplevel)

        branch = observe(target, "branch")
        commit = observe(target, "commit")
        porcelain = observe(target, "porcelain")
    except (OSError, subprocess.SubprocessError) as exc:
        return _degraded("git_failure", f"git could not be executed: {exc}")

    if branch.returncode != 0 or commit.returncode != 0:
        # A repository with no commit yet: real, and not an error worth failing on.
        return {
            "available": True,
            "kind": "unborn_repository",
            "branch": branch.stdout.strip() or None,
            "commit": None,
            "dirty": bool(porcelain.stdout.strip()) if porcelain.returncode == 0 else None,
            "reason": "the repository has no commit yet",
            "root": toplevel.stdout.strip(),
        }

    if porcelain.returncode != 0:
        # The commit is known but the worktree state is not. Reporting dirty=False here would
        # turn a failed observation into a claim that nothing is modified, which is the one
        # direction that must never be guessed: it is what lets evidence certify a tree whose
        # local changes were never looked at.
        return {
            "available": True,
            "kind": "worktree_unobservable",
            "branch": branch.stdout.strip() or None,
            "commit": commit.stdout.strip() or None,
            "dirty": None,
            "reason": _failure_reason("git status --porcelain", porcelain),
            "root": toplevel.stdout.strip(),
        }

    return {
        "available": True,
        "kind": "observed",
        "branch": branch.stdout.strip() or None,
        "commit": commit.stdout.strip() or None,
        "dirty": bool(porcelain.stdout.strip()),
        "reason": "",
        "root": toplevel.stdout.strip(),
    }


def _classify_toplevel_failure(
    target: Path, result: subprocess.CompletedProcess[str]
) -> dict[str, Any]:
    """Decide whether a failed `rev-parse --show-toplevel` means "no repository" or "broken".

    A non-zero exit does not mean the directory is outside a repository. A corrupt object
    store, a permission problem, a refused `safe.directory`, or a broken config all fail the
    same way. That distinction decides certification: `not_repository` is the one degraded kind
    that still lets evidence support a gate, so mapping every failure onto it means a genuine
    Git outage makes stale evidence look current.

    The decision is made from two structural signals and never from the message text. Git's
    diagnostics are translated, so matching on them would make a security decision depend on
    the operator's locale. Anything the two signals cannot settle is a failure, not an absence.
    """
    broken = _failure_reason("git rev-parse --show-toplevel", result)

    # Signal one: is this a bare repository? `--show-toplevel` legitimately fails there for
    # having no work tree. The answer is the literal "true" or "false", which Git does not
    # translate, so reading it is not the locale-dependent message matching this avoids.
    try:
        is_bare = observe(target, "is_bare")
    except (OSError, subprocess.SubprocessError) as exc:
        return _degraded("git_failure", f"git could not be executed: {exc}")
    if is_bare.returncode == 0:
        answer = is_bare.stdout.strip()
        if answer == "true":
            # Real and knowable, not a fault — but there is no work tree for evidence to
            # describe, so it does not certify either.
            return _degraded("bare_repository", "the repository is bare and has no work tree")
        if answer == "false":
            # A work tree exists, so `--show-toplevel` had no business failing.
            return _degraded("git_failure", broken)
        return _degraded("git_failure", f"git returned an unrecognized answer: {answer!r}")

    # Signal two: does Git resolve a repository at all? If it does while the probes above
    # failed, something is wrong with the repository rather than absent.
    try:
        git_dir = observe(target, "git_dir")
    except (OSError, subprocess.SubprocessError) as exc:
        return _degraded("git_failure", f"git could not be executed: {exc}")
    if git_dir.returncode == 0:
        return _degraded("git_failure", broken)

    # Signal three: is there a repository on disk at all? `.git` is a directory in a normal
    # clone and a file in a worktree or submodule, so both count. Only this signal, reached
    # after Git has declined three times, can conclude that there is nothing here.
    located = _locate_git_directory(target)
    if located is None:
        return _degraded("git_failure", "the repository layout could not be inspected")
    if located:
        return _degraded("git_failure", broken)
    return _degraded("not_repository", "the directory is not inside a Git repository")


def _locate_git_directory(target: Path) -> bool | None:
    """Report whether a `.git` entry exists at or above `target`.

    True when one was found, False when the walk completed without finding one, and None when
    the filesystem could not answer — which is ambiguous, and therefore not an absence.
    """
    try:
        current = target.resolve()
    except (OSError, RuntimeError):
        return None
    try:
        for directory in (current, *current.parents):
            candidate = directory / ".git"
            # is_symlink() as well as exists(): a dangling `.git` symlink is a broken
            # repository, not an absent one, and exists() reports False for it.
            if candidate.exists() or candidate.is_symlink():
                return True
            if _looks_bare(directory):
                return True
    except OSError:
        return None
    return False


def _looks_bare(directory: Path) -> bool:
    """Report whether a directory has the layout of a bare repository.

    A bare repository has no `.git` entry — the directory itself is the Git directory — so the
    `.git` walk alone would conclude that a demonstrably present repository is absent.
    """
    return all((directory / name).exists() for name in ("HEAD", "objects", "refs"))


def _failure_reason(label: str, result: subprocess.CompletedProcess[str]) -> str:
    """Describe a failed observation without leaking an unbounded stderr into a report."""
    detail = (result.stderr or "").strip().splitlines()
    first = detail[0][:200] if detail else "no error output"
    return f"{label} failed with exit code {result.returncode}: {first}"


def branch_exists(target: Path, name: str) -> bool:
    """Report whether a local branch exists. Missing Git or repository means False."""
    if not name or not git_available() or not target.is_dir():
        return False
    try:
        result = observe(target, "verify_ref", f"refs/heads/{name}")
    except (OSError, subprocess.SubprocessError):
        return False
    return result.returncode == 0
