"""SQLite persistence adapter for ZHI CareState.

This adapter is a local prototype. Production deployments must additionally use
server-verified identities, database permissions/RLS, encrypted storage where needed,
backups, and independent audit logging.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from zhi_care import CareAccessError, CareError, CareEvidence, CareState, CareStatus, EpistemicStatus


class CareNotFound(CareError):
    """No care record visible to the requesting owner."""


class CareRevisionConflict(CareError):
    """The stored revision changed since the caller loaded it."""


class CareRepository:
    def __init__(self, path: str | Path = ":memory:"):
        self.path = str(path)
        self.db = sqlite3.connect(self.path)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.execute("PRAGMA busy_timeout = 5000")
        self.db.execute("""
            CREATE TABLE IF NOT EXISTS care_records (
                care_id TEXT PRIMARY KEY,
                owner_subject TEXT NOT NULL,
                target_ref TEXT NOT NULL,
                revision INTEGER NOT NULL CHECK (revision >= 1),
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        self.db.execute("""
            CREATE INDEX IF NOT EXISTS idx_care_owner_updated
            ON care_records(owner_subject, updated_at)
        """)
        self.db.commit()

    def close(self) -> None:
        self.db.close()

    @staticmethod
    def _encode(care: CareState) -> str:
        return json.dumps(care.to_dict(), ensure_ascii=False, separators=(",", ":"))

    @staticmethod
    def _decode(payload: str) -> CareState:
        data: dict[str, Any] = json.loads(payload)
        evidence = [
            CareEvidence(
                ref=item["ref"],
                status=EpistemicStatus(item["status"]),
                source_ref=item.get("source_ref"),
                event_time=item.get("event_time"),
                observed_at=item.get("observed_at"),
            )
            for item in data.get("evidence", [])
        ]
        care = CareState(
            care_id=data["care_id"],
            subject_ref=data["subject_ref"],
            target_ref=data["target_ref"],
            care_focus=tuple(data.get("care_focus", [])),
            epistemic_status=EpistemicStatus(data.get("epistemic_status", "unknown")),
            evidence=evidence,
            uncertainties=list(data.get("uncertainties", [])),
            target_preference=data.get("target_preference", "unknown"),
            relationship_context_ref=data.get("relationship_context_ref"),
            goal_refs=list(data.get("goal_refs", [])),
            proposed_action_refs=list(data.get("proposed_action_refs", [])),
            feedback_refs=list(data.get("feedback_refs", [])),
            status=CareStatus(data["state"]),
            access_policy=data.get("access_policy", "private"),
            revision=data["revision"],
            created_at=data["created_at"],
            updated_at=data["updated_at"],
            history=list(data.get("history", [])),
        )
        return care

    def create(self, actor_ref: str, care: CareState) -> None:
        if not isinstance(care, CareState):
            raise CareError("invalid_care_state")
        # The caller identity must come from the trusted server-side auth context.
        care.assert_access(actor_ref)
        if care.access_policy != "private":
            raise CareError("care_records_must_be_private")
        try:
            with self.db:
                self.db.execute(
                    """INSERT INTO care_records
                    (care_id, owner_subject, target_ref, revision, payload_json, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (care.care_id, care.subject_ref, care.target_ref, care.revision,
                     self._encode(care), care.created_at, care.updated_at),
                )
        except sqlite3.IntegrityError as exc:
            raise CareError("care_id_already_exists") from exc

    def get(self, actor_ref: str, care_id: str) -> CareState:
        if not isinstance(actor_ref, str) or not actor_ref.strip():
            raise CareAccessError("private_care_access_denied")
        row = self.db.execute(
            "SELECT payload_json FROM care_records WHERE care_id = ? AND owner_subject = ?",
            (care_id, actor_ref),
        ).fetchone()
        # Do not disclose whether a record exists under another owner's identity.
        if row is None:
            raise CareNotFound("care_record_not_found")
        care = self._decode(row["payload_json"])
        if care.subject_ref != actor_ref:
            raise CareAccessError("private_care_access_denied")
        return care

    def save(self, actor_ref: str, care: CareState, *, expected_revision: int) -> None:
        if not isinstance(care, CareState):
            raise CareError("invalid_care_state")
        care.assert_access(actor_ref)
        if care.access_policy != "private":
            raise CareError("care_records_must_be_private")
        if not isinstance(expected_revision, int) or isinstance(expected_revision, bool) or expected_revision < 1:
            raise CareError("invalid_expected_revision")
        if care.revision <= expected_revision:
            raise CareError("revision_must_advance")
        encoded = self._encode(care)
        with self.db:
            result = self.db.execute(
                """UPDATE care_records
                SET target_ref = ?, revision = ?, payload_json = ?, updated_at = ?
                WHERE care_id = ? AND owner_subject = ? AND revision = ?""",
                (care.target_ref, care.revision, encoded, care.updated_at,
                 care.care_id, actor_ref, expected_revision),
            )
            if result.rowcount != 1:
                exists = self.db.execute(
                    "SELECT 1 FROM care_records WHERE care_id = ? AND owner_subject = ?",
                    (care.care_id, actor_ref),
                ).fetchone()
                if exists is None:
                    raise CareNotFound("care_record_not_found")
                raise CareRevisionConflict("care_revision_conflict")

    def list_for_owner(self, actor_ref: str, *, limit: int = 100) -> list[dict[str, Any]]:
        if not isinstance(actor_ref, str) or not actor_ref.strip():
            raise CareAccessError("private_care_access_denied")
        if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 500:
            raise CareError("invalid_limit")
        rows = self.db.execute(
            """SELECT care_id, target_ref, revision, created_at, updated_at
            FROM care_records WHERE owner_subject = ? ORDER BY updated_at DESC LIMIT ?""",
            (actor_ref, limit),
        ).fetchall()
        return [dict(row) for row in rows]
