#!/usr/bin/env python3
"""Drift detection: where the declared state and the observed reality disagree.

`.vibespec/status.json` says what the team asserts. Git, the filesystem, the cloud lock, and
the evidence directory say what is actually there. Drift is the gap between them.

This command is strictly read-only, and it has no `--fix`. That is a deliberate limit rather
than an unfinished feature: almost every drift has two opposite repairs, and choosing wrongly
destroys information. A declared branch that differs from HEAD might mean "switch branch" or
"update the declaration" — the tool cannot know which, and guessing would silently rewrite
either the work or the record of it.

So drift reports, names both sides, and suggests. The decision stays with a human or with an
agent that has the context to make it.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from evidence import EVIDENCE_TYPES, list_evidence  # noqa: E402
from project_status import GATE_NAMES, read_status, validate_status  # noqa: E402
from vibespec_common import (  # noqa: E402
    add_target_arguments,
    fail,
    read_project_config,
    resolve_target_argument,
)
from vibespec_git import observe_repository  # noqa: E402
from vibespec_json import emit, envelope, error, refuse  # noqa: E402

SEVERITIES = ("info", "warning", "error", "blocking")
_SEVERITY_ORDER = {name: index for index, name in enumerate(("blocking", "error", "warning", "info"))}

DRIFT_CODES = (
    "DRIFT_VIBESPEC_VERSION",
    "DRIFT_BUNDLE_FILES",
    "DRIFT_ACTIVE_BRANCH",
    "DRIFT_ACTIVE_CHANGE_MISSING",
    "DRIFT_STATUS_STALE",
    "DRIFT_EVIDENCE_MISSING",
    "DRIFT_EVIDENCE_UNVERIFIABLE",
    "DRIFT_ARTIFACT_INTEGRITY",
    "DRIFT_GATE_CONTRADICTION",
    "DRIFT_PROJECT_ID",
    "DRIFT_SKILLS_INVENTORY",
    "DRIFT_VALIDATION_COMMAND",
    "DRIFT_DOCUMENT_STATUS",
    "DRIFT_GIT_UNAVAILABLE",
)

CATEGORIES = {
    "DRIFT_VIBESPEC_VERSION": "distribution",
    "DRIFT_BUNDLE_FILES": "distribution",
    "DRIFT_ACTIVE_BRANCH": "git",
    "DRIFT_ACTIVE_CHANGE_MISSING": "artifacts",
    "DRIFT_STATUS_STALE": "status",
    "DRIFT_EVIDENCE_MISSING": "evidence",
    "DRIFT_EVIDENCE_UNVERIFIABLE": "evidence",
    "DRIFT_ARTIFACT_INTEGRITY": "evidence",
    "DRIFT_GATE_CONTRADICTION": "evidence",
    "DRIFT_PROJECT_ID": "identity",
    "DRIFT_SKILLS_INVENTORY": "skills",
    "DRIFT_VALIDATION_COMMAND": "configuration",
    "DRIFT_DOCUMENT_STATUS": "documentation",
    "DRIFT_GIT_UNAVAILABLE": "git",
}

EXPLANATIONS = {
    "DRIFT_VIBESPEC_VERSION": (
        "The version declared in the project status differs from the version recorded in the cloud lock.",
        "Run vibespec cloud sync, then vibespec status reconcile --apply-safe.",
    ),
    "DRIFT_BUNDLE_FILES": (
        "The cloud bundle reports findings: a managed file is missing, modified, or invalid.",
        "Inspect with vibespec cloud diff, then synchronize deliberately.",
    ),
    "DRIFT_ACTIVE_BRANCH": (
        "The declared active branch differs from the branch Git currently has checked out.",
        "Switch to the declared branch, or update the declaration explicitly. VibeSpec will not choose for you.",
    ),
    "DRIFT_ACTIVE_CHANGE_MISSING": (
        "A change is declared active but its documentation artifacts do not exist.",
        "Create them with vibespec start, or clear the active change.",
    ),
    "DRIFT_STATUS_STALE": (
        "The project status has not been updated for a long time while a change is open.",
        "Refresh it as the work progresses; a status nobody updates stops being trustworthy.",
    ),
    "DRIFT_EVIDENCE_MISSING": (
        "A change is being verified or reviewed but no evidence has been recorded.",
        "Record it with vibespec evidence create.",
    ),
    "DRIFT_EVIDENCE_UNVERIFIABLE": (
        "Evidence exists for the active change but no longer describes the tree that is checked "
        "out: it was recorded against a different commit, on an uncommitted tree, or while Git "
        "could not be observed. It cannot support a gate until that is resolved.",
        "Re-run the verification on the current tree, or accept that the older record describes "
        "an older state.",
    ),
    "DRIFT_ARTIFACT_INTEGRITY": (
        "An artifact referenced by evidence no longer matches what was recorded: it is missing, "
        "modified, or resolves outside the project. The evidence itself remains readable, and it "
        "may still support a gate through a recorded command; only the artifact reference is "
        "no longer checkable.",
        "Restore the artifact, or record fresh evidence describing the current state.",
    ),
    "DRIFT_GATE_CONTRADICTION": (
        "A gate is declared passed but no evidence supports it.",
        "Record the evidence, or move the gate back to pending. A gate passed on nothing is worse than a pending one.",
    ),
    "DRIFT_PROJECT_ID": (
        "The identifier in the project status differs from the one in the project configuration.",
        "Align them; two identifiers for one project break every index that keys on it.",
    ),
    "DRIFT_SKILLS_INVENTORY": (
        "The declared skill inventory does not match the skills present on disk.",
        "Regenerate the inventory, or reinstall the missing skills.",
    ),
    "DRIFT_VALIDATION_COMMAND": (
        "No verification command is declared, so completion cannot be proven.",
        "Declare one under commands in .vibespec/project.yaml.",
    ),
    "DRIFT_DOCUMENT_STATUS": (
        "A status document in the repository is much older than the project status.",
        "Converge the documentation, or delete the stale document.",
    ),
    "DRIFT_GIT_UNAVAILABLE": (
        "Git is not a usable source of truth here. Either the directory is confirmed not to be a "
        "repository, which is a supported state, or Git could not be observed at all, which "
        "means the Git-dependent checks were skipped rather than passed. The finding says which.",
        "No action is required for a project without a repository. A failed observation is worth "
        "investigating, because evidence cannot certify a gate while it lasts.",
    ),
}

STALE_STATUS_DAYS = 30
STALE_DOCUMENT_DAYS = 60

# Agent name to skill root. Two agents can share a root, which is correct: the file on disk is
# the same file, so they collapse to one key on both sides of the comparison.
AGENT_SKILL_ROOTS = {
    "codex": ".agents/skills",
    "hermes": ".agents/skills",
    "claude": ".claude/skills",
    "generic": ".vibespec/agent-skills",
}

# Which evidence types can support which gate. A gate is a claim; evidence is what makes the
# claim checkable. Accepting any evidence at all would let a failed documentation record
# certify a passing test gate, which defeats the reason evidence exists.
GATE_EVIDENCE_TYPES = {
    "tests": ("test", "verification"),
    "review": ("review",),
    "documentation": ("documentation",),
    "specification": ("specification",),
    "architecture": ("architecture",),
    "preflight": ("preflight",),
}

# Gates whose claim VibeSpec can check against recorded evidence. The others are process
# judgements that no local artifact can confirm.
VERIFIABLE_GATES = ("tests", "review", "documentation")


# Gates whose claim requires more than a human assertion. A review or a documentation pass is
# a judgement someone makes; a test either ran or it did not, so evidence supporting the tests
# gate must carry a command VibeSpec recorded as executed. Without this, `evidence create
# --type test --result passed` would clear the gate having recorded nothing at all.
GATES_REQUIRING_EXECUTION_RECORD = ("tests",)


def has_execution_record(entry: dict[str, Any]) -> bool:
    """Report whether an evidence summary records a command that ran and passed.

    A verified artifact is deliberately *not* accepted here. Re-hashing proves that a file is
    present, confined, and byte-identical to what was recorded — an integrity fact about a
    file, not an execution fact about a test. Any stable file satisfies it: hashing README.md
    would certify the tests gate for as long as the README goes unedited.

    Schema version 1 has no producer or provenance field, so there is no way to constrain an
    artifact to a genuine test report. Until there is, artifacts stay supplementary evidence
    and only a recorded execution supports this gate.

    This is a record, not a cryptographic guarantee: see the trust boundary in docs/evidence.md.
    """
    return bool(entry.get("hasExecutedCommand"))


def relevant_evidence(
    evidence: list[dict[str, Any]], accepted_types: tuple[str, ...], change_id: str | None
) -> list[dict[str, Any]]:
    """Return valid evidence of an accepted type for this change, whatever its result.

    Relevance is separate from success on purpose. A verification that ran and failed is still
    a verification: reporting "no evidence recorded" there would be factually wrong.
    """
    return [
        item
        for item in evidence
        if item.get("valid")
        and item.get("type") in accepted_types
        and (change_id is None or item.get("changeId") == change_id)
    ]


# Freshness verdicts that let evidence certify a gate. "no_repository" is the one degraded
# mode admitted, and only because it is a *confirmed* fact: Git ran, and answered that this
# directory is not a repository. Every other degradation is an admission that nothing is known,
# and evidence must not become certifying precisely when the verification mechanism is broken.
FRESHNESS_CERTIFYING = ("fresh", "no_repository")

# Observation kinds that establish there is genuinely no repository to correlate against.
_CONFIRMED_NON_REPOSITORY = ("not_repository",)

# Observation kinds where Git itself could not answer. Distinct from "there is no repository":
# the directory may well be one, and nothing here says otherwise.
_UNOBSERVABLE_KINDS = ("git_missing", "git_failure", "no_directory")

# Kinds where the commit is known but the worktree state is not.
_WORKTREE_UNOBSERVABLE_KINDS = ("worktree_unobservable",)


def freshness(entry: dict[str, Any], git: dict[str, Any] | None) -> str:
    """Decide whether a record still describes the tree that is checked out.

    Evidence is a statement about a state of the code. Once the code moves, the statement does
    not become false — it becomes about something else. A run that passed three commits ago
    says nothing about what is checked out now, and treating it as current proof is how a green
    gate outlives the code it was green for.

    Verdicts: `fresh`, `no_repository`, `git_unobservable`, `unborn_repository`,
    `stale_commit`, `worktree_dirty`, `evidence_dirty`, and `uncorrelated`. Pure: the observed
    Git state is passed in, never read here.
    """
    if git is None or not git:
        # No observation was supplied at all. That is not evidence of anything.
        return "git_unobservable"
    kind = git.get("kind")
    if kind in _CONFIRMED_NON_REPOSITORY:
        return "no_repository"
    if kind in _UNOBSERVABLE_KINDS:
        return "git_unobservable"
    if kind in _WORKTREE_UNOBSERVABLE_KINDS:
        return "worktree_unobservable"
    if kind == "bare_repository":
        return "bare_repository"
    if kind == "unborn_repository" or (git.get("available") and not git.get("commit")):
        # A repository exists but has no commit, so nothing can anchor the evidence. This is
        # given its own verdict rather than being folded into "unknown": it is a real, knowable
        # state, and it is not the same as having no repository at all.
        return "unborn_repository"
    if not git.get("available") or not git.get("commit"):
        # An observation that claims neither a kind nor a usable commit. Treated as unobservable
        # rather than as a non-repository, because nothing here proves the absence of one.
        return "git_unobservable"
    if entry.get("sourceDirty") is True:
        # Recorded against uncommitted work. Honest, and still informative, but there is no
        # identifier for "the same uncommitted content", so it cannot be re-established.
        return "evidence_dirty"
    if not entry.get("sourceCommit") or entry.get("sourceDirty") is None:
        # Either no commit, or no record of whether the tree was clean when this ran. Both mean
        # the record cannot be tied to a tree state. `sourceDirty` unknown is treated exactly
        # like an unknown worktree on the observation side: not clean.
        return "uncorrelated"
    if entry.get("sourceCommit") != git.get("commit"):
        return "stale_commit"
    if git.get("dirty") is None:
        # Unknown is not clean. Checked here as well as in the observer, because `dirty` falling
        # back to a falsy default is the single mistake that would let evidence certify a tree
        # nobody looked at, and this function must give the right answer for any observation it
        # is handed — not only the ones this repository happens to produce today.
        return "worktree_unobservable"
    if git.get("dirty"):
        # The commit matches, but the tree has uncommitted changes the run never saw.
        return "worktree_dirty"
    return "fresh"


# Classified by what is *intact*, not by what is broken. An allowlist of failure names would
# silently ignore any status added to evidence.py later; this way an unrecognized status is
# reported rather than passed over. A test ties the two modules together so the list cannot
# drift out of date unnoticed.
INTACT_ARTIFACT_STATUSES = ("verified", "unchecked", "unhashed")


def broken_artifacts(entry: dict[str, Any]) -> list[str]:
    """Return the artifact statuses that no longer check out, if any."""
    return sorted(
        {
            status
            for status in entry.get("artifactStatuses") or []
            if status not in INTACT_ARTIFACT_STATUSES
        }
    )


def _unverifiable_reason(entry: dict[str, Any], git: dict[str, Any] | None) -> str | None:
    """Name why a passed record cannot certify anything, or None when it can.

    This is deliberately *only* about freshness, so that it agrees with `supporting_evidence`
    by construction rather than by coincidence: a record is unverifiable exactly when its
    freshness verdict is not certifying. A test asserts that equivalence.

    A broken artifact used to be reported here. It no longer is, because artifacts stopped
    certifying any gate: saying "this evidence cannot be verified" about a record whose command
    still supports the gate would make the report contradict itself. Artifact breakage is real
    and is reported by DRIFT_ARTIFACT_INTEGRITY, which does not claim the evidence is void.
    """
    verdict = freshness(entry, git)
    if verdict in FRESHNESS_CERTIFYING:
        return None
    reason = {
        "stale_commit": "recorded against a different commit",
        "worktree_dirty": "recorded on a clean tree that now has uncommitted changes",
        "evidence_dirty": "recorded on an uncommitted tree",
        "uncorrelated": "recorded without enough Git context to correlate: no commit, or no "
        "record of whether the tree was clean",
        "unborn_repository": "the repository has no commit to correlate against",
        "bare_repository": "the repository is bare, so there is no work tree to correlate against",
        "git_unobservable": "Git could not be observed, so freshness cannot be established",
        "worktree_unobservable": "the worktree state could not be read, so local changes are unknown",
    }[verdict]
    # Name what Git actually said. "Git could not be observed" and "git is not installed" send
    # someone to different places, and the observer already knows which one it was.
    detail = (git or {}).get("reason")
    if verdict in ("git_unobservable", "worktree_unobservable") and detail:
        reason = f"{reason} ({detail})"
    return reason


def supporting_evidence(
    evidence: list[dict[str, Any]], gate: str, change_id: str | None, *, git: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    """Return the evidence that can actually support a passed gate.

    Belonging to this change, being structurally valid, having passed, and having an accepted
    type are all necessary. Gates that require an execution record additionally reject a bare
    human assertion: a document whose only content is `"result": "passed"` records that someone
    typed a word, not that anything ran.

    `git` carries the observed repository state. Omitting it does not skip the freshness check
    — an absent observation is treated as unobservable, which does not certify.
    """
    accepted = GATE_EVIDENCE_TYPES.get(gate, ())
    candidates = [
        item
        for item in relevant_evidence(evidence, accepted, change_id)
        if item.get("result") == "passed"
    ]
    if gate in GATES_REQUIRING_EXECUTION_RECORD:
        candidates = [item for item in candidates if has_execution_record(item)]
    return [item for item in candidates if freshness(item, git) in FRESHNESS_CERTIFYING]


# Status documents VibeSpec knows how to notice. Only these names are considered; the
# repository is never walked looking for candidates.
KNOWN_STATUS_DOCUMENTS = (
    "PROJECT_STATUS.md",
    "DEVELOPMENT_STATUS.md",
    "IMPLEMENTATION_STATUS.md",
    "HANDOFF.md",
)


def source_version() -> str:
    for candidate in (SCRIPT_DIR.parent / "manifest.json", SCRIPT_DIR.parent / "bundle/manifest.json"):
        if candidate.is_file():
            try:
                return str(json.loads(candidate.read_text(encoding="utf-8")).get("version", "unknown"))
            except (OSError, ValueError):
                continue
    return "unknown"


def finding_sort_key(item: Any) -> tuple[int, str]:
    if isinstance(item, dict):
        severity, code = item["severity"], item["code"]
    else:
        severity, code = item
    return (_SEVERITY_ORDER.get(severity, len(_SEVERITY_ORDER)), code)


def _finding(code: str, severity: str, declared: Any, observed: Any, message: str) -> dict[str, Any]:
    return {
        "code": code,
        "category": CATEGORIES[code],
        "severity": severity,
        "declared": declared,
        "observed": observed,
        "message": message,
        "suggestion": EXPLANATIONS[code][1],
    }


def explain(code: str) -> dict[str, str]:
    """Describe one drift code. An unknown code raises rather than inventing a meaning."""
    meaning, resolution = EXPLANATIONS[code]
    return {
        "code": code,
        "category": CATEGORIES[code],
        "meaning": meaning,
        "resolution": resolution,
    }


def _age_days(stamp: Any) -> float | None:
    if not isinstance(stamp, str):
        return None
    try:
        moment = datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None
    return (datetime.now(timezone.utc) - moment) / timedelta(days=1)


# ---------------------------------------------------------------------------
# Drift computation. Pure: declared document plus an observation mapping.
# ---------------------------------------------------------------------------


def compute_drift(status: dict[str, Any], observed: dict[str, Any]) -> list[dict[str, Any]]:
    """Compare the declared document against observed facts."""
    findings: list[dict[str, Any]] = []

    change = status.get("activeChange")
    change = change if isinstance(change, dict) else None
    gates = status.get("gates") or {}
    git = observed.get("git") or {}
    evidence = observed.get("evidence") or []

    declared_version = (status.get("vibespec") or {}).get("version")
    lock = observed.get("lock") or {}
    observed_version = lock.get("vibespec_version")
    if observed_version and declared_version and declared_version != observed_version:
        findings.append(
            _finding(
                "DRIFT_VIBESPEC_VERSION",
                "warning",
                declared_version,
                observed_version,
                "The declared VibeSpec version differs from the one recorded in the cloud lock.",
            )
        )

    bundle_findings = observed.get("bundleFindings") or []
    if bundle_findings:
        findings.append(
            _finding(
                "DRIFT_BUNDLE_FILES",
                "error",
                "an intact bundle",
                f"{len(bundle_findings)} bundle finding(s)",
                "The cloud bundle reports findings.",
            )
        )

    # Two independent questions, deliberately no longer chained through one if/elif. Whether to
    # report Git as unusable and whether a branch can be compared are different decisions, and
    # coupling them meant changing one silently changed the other.
    git_kind = git.get("kind")
    if git_kind == "not_repository":
        # Git answered. Saying "Git could not be observed" here would be false, and this is the
        # one degraded state that still lets evidence certify a gate.
        findings.append(
            _finding(
                "DRIFT_GIT_UNAVAILABLE",
                "info",
                "a Git repository",
                "confirmed: this directory is not inside a Git repository",
                "There is no Git repository, so the Git-dependent checks do not apply.",
            )
        )
    elif not git.get("available") or git_kind in (
        "worktree_unobservable",
        "unborn_repository",
        "bare_repository",
    ):
        # Git did not answer, or answered only partly. This is not the supported case: it means
        # the checks were skipped rather than passed, and evidence cannot certify while it lasts.
        findings.append(
            _finding(
                "DRIFT_GIT_UNAVAILABLE",
                "warning",
                "a readable Git repository",
                git.get("reason") or "Git could not be observed",
                "Git could not be observed; Git-dependent checks were skipped, not passed.",
            )
        )

    # Asked separately: a branch can be compared whenever one was actually observed, whatever
    # else about the repository could not be read.
    observed_branch = git.get("branch")
    if change and change.get("branch") and observed_branch and observed_branch != change["branch"]:
        findings.append(
            _finding(
                "DRIFT_ACTIVE_BRANCH",
                "warning",
                change["branch"],
                observed_branch,
                "The declared active branch differs from the current Git branch.",
            )
        )

    if change and not observed.get("changeArtifacts", True):
        findings.append(
            _finding(
                "DRIFT_ACTIVE_CHANGE_MISSING",
                "error",
                change.get("id"),
                "no artifact directory",
                "The active change has no documentation artifacts.",
            )
        )

    age = _age_days(status.get("updatedAt"))
    if change and age is not None and age > STALE_STATUS_DAYS:
        findings.append(
            _finding(
                "DRIFT_STATUS_STALE",
                "warning",
                status.get("updatedAt"),
                f"{int(age)} days old",
                "A change is open but the status has not been updated recently.",
            )
        )

    # Relevance, not merely existence. A change under verification whose only record is a
    # documentation note has no verification evidence, and unrelated evidence must not
    # suppress that. Success is deliberately not required here: a verification that ran and
    # failed is still a verification, and reporting "no evidence recorded" would be false.
    if change:
        expected_by_state = {
            "verifying": ("test", "verification"),
            "reviewing": ("review",),
        }
        accepted = expected_by_state.get(change.get("status"))
        if accepted and not relevant_evidence(evidence, accepted, change.get("id")):
            findings.append(
                _finding(
                    "DRIFT_EVIDENCE_MISSING",
                    "error",
                    f"{change.get('status')}, expecting " + " or ".join(accepted),
                    "no evidence of that type for this change",
                    "The change is being verified or reviewed with no relevant evidence.",
                )
            )

    change_id = change.get("id") if change else None
    git = observed.get("git")

    # Evidence that passed and is relevant, yet no longer describes the tree that is checked
    # out. Reporting this separately matters: "no evidence" and "evidence that no longer
    # applies" call for opposite responses, and a single message covering both would send
    # people looking for a record that is already there.
    if change_id:
        passed_records = [
            item
            for item in relevant_evidence(evidence, tuple(EVIDENCE_TYPES), change_id)
            if item.get("result") == "passed"
        ]
        unverifiable = sorted(
            {reason for item in passed_records if (reason := _unverifiable_reason(item, git))}
        )
        if unverifiable:
            findings.append(
                _finding(
                    "DRIFT_EVIDENCE_UNVERIFIABLE",
                    "warning",
                    "passed evidence recorded for this change",
                    ", ".join(unverifiable),
                    "Evidence exists but no longer describes the tree that is checked out.",
                )
            )

        # Artifact breakage is reported on its own, and its wording is deliberately not
        # absolute. An artifact no longer certifies any gate, so a record whose command still
        # supports one is not void because a supplementary file was deleted — and saying it was
        # would make this report contradict the gate result printed a few lines below it.
        damaged = sorted({status for item in passed_records for status in broken_artifacts(item)})
        if damaged:
            findings.append(
                _finding(
                    "DRIFT_ARTIFACT_INTEGRITY",
                    "warning",
                    "artifacts referenced by evidence for this change",
                    ", ".join(damaged),
                    "A referenced artifact no longer matches what was recorded.",
                )
            )

    unsupported = [
        name
        for name in VERIFIABLE_GATES
        if gates.get(name) == "passed" and not supporting_evidence(evidence, name, change_id, git=git)
    ]
    if unsupported:
        findings.append(
            _finding(
                "DRIFT_GATE_CONTRADICTION",
                "blocking",
                ", ".join(sorted(unsupported)),
                "no passed, verifiable, current evidence of an accepted type for this change",
                "A gate is declared passed but no evidence supports it.",
            )
        )

    declared_id = (status.get("project") or {}).get("id")
    configured_id = observed.get("projectConfigId")
    if declared_id and configured_id and declared_id != configured_id:
        findings.append(
            _finding(
                "DRIFT_PROJECT_ID",
                "warning",
                declared_id,
                configured_id,
                "The status project id differs from the project configuration.",
            )
        )

    # The comparison only runs when an inventory file exists. An absent inventory is not drift
    # in this release; a present one that disagrees with disk is, including when it declares
    # nothing while skills are installed. Silence on that case would make the rule useless.
    inventory = observed.get("skillsInventory") or {}
    if inventory.get("present"):
        if not inventory.get("valid", True):
            findings.append(
                _finding(
                    "DRIFT_SKILLS_INVENTORY",
                    "error",
                    "a readable inventory",
                    "the inventory could not be parsed",
                    "The declared skill inventory is unreadable.",
                )
            )
        else:
            declared_skills = sorted(inventory.get("declared") or [])
            observed_skills = sorted(inventory.get("observed") or [])
            if declared_skills != observed_skills:
                findings.append(
                    _finding(
                        "DRIFT_SKILLS_INVENTORY",
                        "error",
                        declared_skills,
                        observed_skills,
                        "The declared skill inventory does not match the skills on disk.",
                    )
                )

    if change and not (observed.get("validationCommands") or {}):
        findings.append(
            _finding(
                "DRIFT_VALIDATION_COMMAND",
                "warning",
                "a verification command",
                "none declared",
                "No verification command is declared, so completion cannot be proven.",
            )
        )

    # Relative to the project status, not to the clock. An old repository whose documents and
    # status were both written long ago is consistent, not drifted; what matters is a document
    # that has fallen far behind the status.
    status_age = _age_days(status.get("updatedAt"))
    for document in observed.get("documentStatuses") or []:
        document_age = _age_days(document.get("updatedAt"))
        if document_age is None or status_age is None:
            continue
        lag = document_age - status_age
        if lag > STALE_DOCUMENT_DAYS:
            findings.append(
                _finding(
                    "DRIFT_DOCUMENT_STATUS",
                    "info",
                    status.get("updatedAt"),
                    f"{document.get('path')} is {int(lag)} days behind the project status",
                    "A status document has fallen far behind the project status.",
                )
            )

    return sorted(findings, key=finding_sort_key)


def filter_findings(
    findings: list[dict[str, Any]], *, severity: str | None = None, category: str | None = None
) -> list[dict[str, Any]]:
    selected = findings
    if severity:
        selected = [item for item in selected if item["severity"] == severity]
    if category:
        selected = [item for item in selected if item["category"] == category]
    return selected


# ---------------------------------------------------------------------------
# Observation. Read-only.
# ---------------------------------------------------------------------------


def inspect_bundle(target: Path) -> list[dict[str, Any]]:
    """Return real cloud bundle findings.

    This delegates to the same read-only inspection `cloud check` uses, rather than
    re-implementing a second, weaker validator. Checking only that the lock parses would
    report an intact bundle while managed files are missing, modified, or replaced by
    directories — which is exactly the failure this drift code exists to catch.
    """
    lock_path = target / ".vibespec/lock.json"
    if not lock_path.is_file():
        return []
    try:
        from cloud_bundle import check_bundle_report
    except ImportError:
        # Vendored bundles carry cloud_bundle.py; a stripped installation may not. Degrade
        # honestly rather than silently reporting a healthy bundle.
        return [
            {
                "code": "BUNDLE_INSPECTION_UNAVAILABLE",
                "severity": "warning",
                "message": "cloud_bundle is not importable, so the bundle was not inspected",
            }
        ]
    try:
        report = check_bundle_report(target)
    except (OSError, ValueError) as exc:
        return [{"code": "LOCK_INVALID", "severity": "error", "message": str(exc)}]
    return [item for item in report.get("findings", []) if item.get("severity") == "error"]


def observe_project(target: Path) -> dict[str, Any]:
    """Gather observable facts. Reads and reports; changes nothing."""
    target = Path(target).expanduser()

    git = observe_repository(target)

    # An unparseable lock is not tracked separately here: inspect_bundle() reports it as a
    # bundle finding, and carrying a second flag nobody reads only invites the two to disagree.
    lock: dict[str, Any] = {}
    lock_path = target / ".vibespec/lock.json"
    if lock_path.is_file():
        try:
            loaded = json.loads(lock_path.read_text(encoding="utf-8"))
            lock = loaded if isinstance(loaded, dict) else {}
        except (OSError, ValueError):
            lock = {}

    project_config_id = None
    validation_commands: dict[str, Any] = {}
    config_path = target / ".vibespec/project.yaml"
    if config_path.is_file():
        try:
            config = read_project_config(config_path)
        except (OSError, ValueError):
            config = {}
        project = config.get("project")
        if isinstance(project, dict) and isinstance(project.get("name"), str):
            project_config_id = project["name"]
        commands = config.get("commands")
        if isinstance(commands, dict):
            validation_commands = {
                key: value for key, value in commands.items() if key in ("test", "lint", "typecheck", "build")
            }

    documents = []
    for name in KNOWN_STATUS_DOCUMENTS:
        path = target / name
        if path.is_file():
            stamp = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
            documents.append({"path": name, "updatedAt": stamp.strftime("%Y-%m-%dT%H:%M:%SZ")})

    return {
        "git": git,
        "lock": lock,
        "bundleFindings": inspect_bundle(target),
        "changeArtifacts": True,
        "evidence": [],
        "skillsInventory": {"present": False, "valid": True, "declared": [], "observed": []},
        "validationCommands": validation_commands,
        "documentStatuses": documents,
        "projectConfigId": project_config_id,
    }


def _change_artifacts_exist(target: Path, change_id: str | None) -> bool:
    if not change_id:
        return True
    docs_root = target / "docs/changes" / change_id
    return docs_root.is_dir()


def collect(target: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    """Read the declared document and gather every observation the drift rules need."""
    target = Path(target).expanduser().resolve()
    status = read_status(target)
    observed = observe_project(target)

    change = status.get("activeChange")
    change_id = change.get("id") if isinstance(change, dict) else None
    observed["changeArtifacts"] = _change_artifacts_exist(target, change_id)
    # verify=True re-hashes every recorded artifact. Drift is the one caller that must know
    # whether a recorded hash still matches, rather than merely that one was written down.
    observed["evidence"] = [
        item for item in list_evidence(target, change_id, verify=True) if item.get("valid")
    ]

    inventory_path = target / ".vibespec/skills.lock.json"
    if inventory_path.is_file():
        try:
            inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
            inventory_valid = isinstance(inventory, dict)
        except (OSError, ValueError):
            inventory = {}
            inventory_valid = False

        # Both sides are normalized to <skill-root>:<skill-name>. The declared side names
        # agents, so it is expanded through AGENT_SKILL_ROOTS; the observed side already is a
        # root. Comparing a scope against a directory would never match, and the rule would
        # become permanent noise the moment a real inventory exists.
        declared_pairs: set[str] = set()
        for skill in inventory.get("skills") or []:
            if not isinstance(skill, dict) or not skill.get("name"):
                continue
            agents = skill.get("agents")
            agents = agents if isinstance(agents, list) else []
            for agent in agents:
                root = AGENT_SKILL_ROOTS.get(agent)
                if root:
                    declared_pairs.add(f"{root}:{skill['name']}")
        declared = sorted(declared_pairs)

        observed_skills: list[str] = []
        for root in sorted(set(AGENT_SKILL_ROOTS.values())):
            directory = target / root
            if directory.is_dir():
                observed_skills.extend(
                    f"{root}:{item.name}"
                    for item in sorted(directory.iterdir())
                    if (item / "SKILL.md").is_file()
                )
        observed["skillsInventory"] = {
            "present": True,
            "valid": inventory_valid,
            "declared": declared,
            "observed": sorted(set(observed_skills)),
        }

    return status, observed


# ---------------------------------------------------------------------------
# Rendering.
# ---------------------------------------------------------------------------


def format_report(report: dict[str, Any]) -> str:
    summary = report["summary"]
    lines = [
        "VibeSpec drift check",
        "",
        f"Findings: {summary['total']}",
        f"Blocking: {summary['blocking']}",
        f"Errors: {summary['errors']}",
        f"Warnings: {summary['warnings']}",
    ]
    if not report["findings"]:
        lines.extend(["", "The declared state matches every observation."])
        return "\n".join(lines)

    for finding in report["findings"]:
        lines.append("")
        lines.append(f"[{finding['severity'].upper()}] {finding['code']}")
        lines.append(f"  Declared: {finding['declared']}")
        lines.append(f"  Observed: {finding['observed']}")
        lines.append(f"  {finding['message']}")
        lines.append(f"  {finding['suggestion']}")
    return "\n".join(lines)


def build_report(findings: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "summary": {
            "total": len(findings),
            "blocking": sum(1 for item in findings if item["severity"] == "blocking"),
            "errors": sum(1 for item in findings if item["severity"] == "error"),
            "warnings": sum(1 for item in findings if item["severity"] == "warning"),
            "info": sum(1 for item in findings if item["severity"] == "info"),
        },
        "findings": findings,
    }


# ---------------------------------------------------------------------------
# CLI.
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    checker = subparsers.add_parser("check", help="Report drift between declared and observed state")
    add_target_arguments(checker)
    checker.add_argument("--json", action="store_true", dest="as_json")
    checker.add_argument("--strict", action="store_true", help="Exit non-zero on any finding")
    checker.add_argument("--severity", default=None, choices=SEVERITIES)
    checker.add_argument("--category", default=None)

    explainer = subparsers.add_parser("explain", help="Explain one drift code")
    explainer.add_argument("code", metavar="CODE")
    explainer.add_argument("--json", action="store_true", dest="as_json")

    args = parser.parse_args()

    if args.command == "explain":
        try:
            explanation = explain(args.code)
        except KeyError:
            return refuse(
                "drift.explain",
                "DRIFT_UNKNOWN_CODE",
                f"Unknown drift code: {args.code}\n"
                "Known codes:\n  " + "\n  ".join(DRIFT_CODES),
                as_json=args.as_json,
            )
        human = (
            f"{explanation['code']} ({explanation['category']})\n"
            f"\n{explanation['meaning']}\n"
            f"\nResolution:\n  {explanation['resolution']}"
        )
        return emit(envelope("drift.explain", result=explanation), as_json=args.as_json, human=human)

    try:
        target = resolve_target_argument(args.target_positional, args.target_option)
    except ValueError as exc:
        return refuse("drift.check", "TARGET_INVALID", str(exc), as_json=args.as_json)

    try:
        status, observed = collect(target)
    except FileNotFoundError as exc:
        return refuse("drift.check", "STATUS_NOT_FOUND", str(exc), as_json=args.as_json)
    except ValueError as exc:
        return refuse("drift.check", "STATUS_UNREADABLE", str(exc), as_json=args.as_json)

    invalid = validate_status(status)
    if invalid:
        payload = envelope(
            "drift.check",
            errors=[
                error(item["code"], item["message"], path=item.get("path")) for item in invalid
            ],
        )
        emit(payload, as_json=args.as_json)
        return 2

    findings = filter_findings(
        compute_drift(status, observed), severity=args.severity, category=args.category
    )
    report = build_report(findings)
    emit(envelope("drift.check", result=report), as_json=args.as_json, human=format_report(report))

    if args.strict and findings:
        return 1
    return 1 if report["summary"]["blocking"] or report["summary"]["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
