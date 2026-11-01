"""ZHI Care mechanism v1.0 reference implementation.

This module models care as an auditable cognition/value/action state process.
It is a local domain primitive, not a production persistence or authorization layer.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Iterable

CARE_PROTOCOL = "zhi-care/1.0"


class CareError(ValueError):
    """Invalid care-state data or transition."""


class CareAccessError(PermissionError):
    """A caller is not allowed to read or mutate this private care record."""


class EpistemicStatus(str, Enum):
    OBSERVED = "observed"
    REPORTED = "reported"
    VERIFIED = "verified"
    INFERRED = "inferred"
    HYPOTHESIS = "hypothesis"
    UNKNOWN = "unknown"
    CONFLICTED = "conflicted"


class CareStatus(str, Enum):
    DISCOVERED = "discovered"
    UNDERSTANDING = "understanding"
    GOAL_SET = "goal_set"
    ACTION_REVIEW = "action_review"
    IN_PROGRESS = "in_progress"
    FEEDBACK_REVIEW = "feedback_review"
    WAITING_FOR_RESPONSE = "waiting_for_response"
    PAUSED = "paused"
    CONFLICT = "conflict"
    RESOLVED = "resolved"
    TERMINATED = "terminated"


TERMINAL_STATUSES = frozenset({CareStatus.RESOLVED, CareStatus.TERMINATED})

ALLOWED_TRANSITIONS = {
    CareStatus.DISCOVERED: frozenset({CareStatus.UNDERSTANDING, CareStatus.PAUSED, CareStatus.TERMINATED}),
    CareStatus.UNDERSTANDING: frozenset({CareStatus.GOAL_SET, CareStatus.WAITING_FOR_RESPONSE, CareStatus.PAUSED, CareStatus.CONFLICT, CareStatus.TERMINATED}),
    CareStatus.GOAL_SET: frozenset({CareStatus.ACTION_REVIEW, CareStatus.PAUSED, CareStatus.TERMINATED}),
    CareStatus.ACTION_REVIEW: frozenset({CareStatus.IN_PROGRESS, CareStatus.WAITING_FOR_RESPONSE, CareStatus.GOAL_SET, CareStatus.PAUSED, CareStatus.TERMINATED}),
    CareStatus.IN_PROGRESS: frozenset({CareStatus.FEEDBACK_REVIEW, CareStatus.WAITING_FOR_RESPONSE, CareStatus.PAUSED, CareStatus.CONFLICT, CareStatus.TERMINATED}),
    CareStatus.FEEDBACK_REVIEW: frozenset({CareStatus.UNDERSTANDING, CareStatus.GOAL_SET, CareStatus.RESOLVED, CareStatus.PAUSED, CareStatus.CONFLICT, CareStatus.TERMINATED}),
    CareStatus.WAITING_FOR_RESPONSE: frozenset({CareStatus.UNDERSTANDING, CareStatus.PAUSED, CareStatus.TERMINATED}),
    CareStatus.PAUSED: frozenset({CareStatus.UNDERSTANDING, CareStatus.GOAL_SET, CareStatus.ACTION_REVIEW, CareStatus.TERMINATED}),
    CareStatus.CONFLICT: frozenset({CareStatus.UNDERSTANDING, CareStatus.PAUSED, CareStatus.TERMINATED}),
    CareStatus.RESOLVED: frozenset(),
    CareStatus.TERMINATED: frozenset(),
}


def _required_id(value: str, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > 200:
        raise CareError(f"invalid_{field_name}")
    return value


@dataclass(frozen=True)
class CareEvidence:
    """Evidence reference with explicit epistemic status; content stays elsewhere."""
    ref: str
    status: EpistemicStatus
    source_ref: str | None = None
    event_time: str | None = None
    observed_at: str | None = None

    def __post_init__(self) -> None:
        _required_id(self.ref, "evidence_ref")
        if not isinstance(self.status, EpistemicStatus):
            raise CareError("invalid_epistemic_status")


@dataclass
class CareState:
    care_id: str
    subject_ref: str
    target_ref: str
    care_focus: tuple[str, ...] = ()
    epistemic_status: EpistemicStatus = EpistemicStatus.UNKNOWN
    evidence: list[CareEvidence] = field(default_factory=list)
    uncertainties: list[str] = field(default_factory=list)
    target_preference: str = "unknown"
    relationship_context_ref: str | None = None
    goal_refs: list[str] = field(default_factory=list)
    proposed_action_refs: list[str] = field(default_factory=list)
    feedback_refs: list[str] = field(default_factory=list)
    status: CareStatus = CareStatus.DISCOVERED
    access_policy: str = "private"
    revision: int = 1
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    history: list[dict[str, str | int]] = field(default_factory=list)

    def __post_init__(self) -> None:
        _required_id(self.care_id, "care_id")
        _required_id(self.subject_ref, "subject_ref")
        _required_id(self.target_ref, "target_ref")
        if self.subject_ref == self.target_ref:
            raise CareError("care_subject_target_must_differ")
        if self.access_policy != "private":
            raise CareError("care_records_must_be_private")
        if not isinstance(self.status, CareStatus):
            raise CareError("invalid_care_status")
        if not isinstance(self.epistemic_status, EpistemicStatus):
            raise CareError("invalid_epistemic_status")
        if not isinstance(self.revision, int) or isinstance(self.revision, bool) or self.revision < 1:
            raise CareError("invalid_revision")
        self.care_focus = tuple(self.care_focus)
        self._validate_string_list(self.care_focus, "care_focus")
        self._validate_string_list(self.uncertainties, "uncertainties")
        self._validate_string_list(self.goal_refs, "goal_refs")
        self._validate_string_list(self.proposed_action_refs, "proposed_action_refs")
        self._validate_string_list(self.feedback_refs, "feedback_refs")

    @staticmethod
    def _validate_string_list(values: Iterable[str], field_name: str) -> None:
        if any(not isinstance(value, str) or not value.strip() for value in values):
            raise CareError(f"invalid_{field_name}")

    def assert_access(self, actor_ref: str) -> None:
        """Application-level owner check; production storage needs server-side policy too."""
        if actor_ref != self.subject_ref:
            raise CareAccessError("private_care_access_denied")

    def transition(
        self,
        actor_ref: str,
        new_status: CareStatus,
        *,
        reason: str,
        permission_granted: bool = False,
        capability_confirmed: bool = False,
        risk_checked: bool = False,
        now: datetime | None = None,
    ) -> None:
        self.assert_access(actor_ref)
        _required_id(reason, "transition_reason")
        if not isinstance(new_status, CareStatus):
            raise CareError("invalid_care_status")
        if new_status not in ALLOWED_TRANSITIONS[self.status]:
            raise CareError(f"invalid_transition:{self.status.value}->{new_status.value}")
        if new_status == CareStatus.IN_PROGRESS:
            if not permission_granted:
                raise CareError("action_permission_required")
            if not capability_confirmed:
                raise CareError("action_capability_unconfirmed")
            if not risk_checked:
                raise CareError("action_risk_check_required")
        timestamp = (now or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat()
        previous = self.status
        self.status = new_status
        self.revision += 1
        self.updated_at = timestamp
        self.history.append({
            "from": previous.value, "to": new_status.value, "reason": reason,
            "revision": self.revision, "at": timestamp,
        })

    def add_evidence(self, actor_ref: str, evidence: CareEvidence) -> None:
        self.assert_access(actor_ref)
        if not isinstance(evidence, CareEvidence):
            raise CareError("invalid_evidence")
        if any(item.ref == evidence.ref for item in self.evidence):
            raise CareError("duplicate_evidence_ref")
        self.evidence.append(evidence)
        self.revision += 1
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> dict:
        """Serialize metadata without private evidence contents or unrelated memory."""
        return {
            "protocol": CARE_PROTOCOL,
            "ontology_type": "CareState",
            "care_id": self.care_id,
            "subject_ref": self.subject_ref,
            "target_ref": self.target_ref,
            "care_focus": list(self.care_focus),
            "epistemic_status": self.epistemic_status.value,
            "evidence": [{
                "ref": item.ref, "status": item.status.value, "source_ref": item.source_ref,
                "event_time": item.event_time, "observed_at": item.observed_at,
            } for item in self.evidence],
            "uncertainties": list(self.uncertainties),
            "target_preference": self.target_preference,
            "relationship_context_ref": self.relationship_context_ref,
            "goal_refs": list(self.goal_refs),
            "proposed_action_refs": list(self.proposed_action_refs),
            "feedback_refs": list(self.feedback_refs),
            "state": self.status.value,
            "access_policy": self.access_policy,
            "revision": self.revision,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "history": list(self.history),
        }
