"""Minimal ZHI community engine: explicit visibility, authenticated admission, scoped membership.

This module is a local reference implementation, not a production authentication service.
Callers MUST derive actor_id from a verified server-side identity, never from an untrusted
request body. Cross-cloud authentication and signed protocol envelopes are separate layers.
"""
from __future__ import annotations

import hashlib
import secrets
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


VISIBILITIES = {"public", "private"}
SCENE_STATES = {"open", "paused", "closed"}


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class CommunityError(Exception):
    """Base error for community operations."""


class NotFound(CommunityError):
    pass


class PermissionDenied(CommunityError):
    pass


class StateConflict(CommunityError):
    pass


class ZHICommunity:
    """SQLite reference engine for scenes, membership, messages, and event history."""

    def __init__(self, path: str | Path = ":memory:"):
        self.path = str(path)
        self.db = sqlite3.connect(self.path)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys = ON")
        self._init_schema()

    def close(self) -> None:
        self.db.close()

    def _init_schema(self) -> None:
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS agents (
          agent_id TEXT PRIMARY KEY, display_name TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('active','suspended','revoked'))
        );
        CREATE TABLE IF NOT EXISTS scenes (
          scene_id TEXT PRIMARY KEY, name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          visibility TEXT NOT NULL CHECK(visibility IN ('public','private')),
          state TEXT NOT NULL CHECK(state IN ('open','paused','closed')),
          owner_agent_id TEXT NOT NULL REFERENCES agents(agent_id),
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS memberships (
          scene_id TEXT NOT NULL REFERENCES scenes(scene_id),
          agent_id TEXT NOT NULL REFERENCES agents(agent_id),
          role TEXT NOT NULL CHECK(role IN ('owner','moderator','member')),
          can_interact INTEGER NOT NULL DEFAULT 1 CHECK(can_interact IN (0,1)),
          joined_at TEXT NOT NULL,
          PRIMARY KEY(scene_id, agent_id)
        );
        CREATE TABLE IF NOT EXISTS invitations (
          invitation_id TEXT PRIMARY KEY, scene_id TEXT NOT NULL REFERENCES scenes(scene_id),
          token_hash TEXT NOT NULL UNIQUE, invited_agent_id TEXT REFERENCES agents(agent_id),
          expires_at TEXT, revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1)),
          created_by TEXT NOT NULL REFERENCES agents(agent_id), created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
          message_id TEXT PRIMARY KEY, scene_id TEXT NOT NULL REFERENCES scenes(scene_id),
          sender_agent_id TEXT NOT NULL REFERENCES agents(agent_id),
          body TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS events (
          event_id TEXT PRIMARY KEY, scene_id TEXT NOT NULL REFERENCES scenes(scene_id),
          event_type TEXT NOT NULL, actor_agent_id TEXT NOT NULL REFERENCES agents(agent_id),
          payload_json TEXT NOT NULL, created_at TEXT NOT NULL
        );
        """)
        self.db.commit()

    def register_agent(self, agent_id: str, display_name: str) -> None:
        if not agent_id.strip() or not display_name.strip():
            raise ValueError("agent_id and display_name are required")
        self.db.execute(
            "INSERT INTO agents(agent_id,display_name,status) VALUES(?,?,'active') "
            "ON CONFLICT(agent_id) DO UPDATE SET display_name=excluded.display_name",
            (agent_id, display_name),
        )
        self.db.commit()

    def _require_active_agent(self, agent_id: str) -> None:
        row = self.db.execute("SELECT status FROM agents WHERE agent_id=?", (agent_id,)).fetchone()
        if not row or row["status"] != "active":
            raise PermissionDenied("actor identity is unknown, suspended, or revoked")

    def _scene(self, scene_id: str) -> sqlite3.Row:
        row = self.db.execute("SELECT * FROM scenes WHERE scene_id=?", (scene_id,)).fetchone()
        if not row:
            raise NotFound("scene not found")
        return row

    def _member(self, scene_id: str, agent_id: str) -> sqlite3.Row:
        row = self.db.execute(
            "SELECT * FROM memberships WHERE scene_id=? AND agent_id=?", (scene_id, agent_id)
        ).fetchone()
        if not row:
            raise PermissionDenied("scene membership required")
        return row

    def _event(self, scene_id: str, actor: str, event_type: str, payload: dict[str, Any]) -> None:
        import json
        self.db.execute(
            "INSERT INTO events(event_id,scene_id,event_type,actor_agent_id,payload_json,created_at) "
            "VALUES(?,?,?,?,?,?)",
            (new_id("evt"), scene_id, event_type, actor,
             json.dumps(payload, ensure_ascii=False, sort_keys=True), now()),
        )

    def create_scene(self, actor_id: str, name: str, visibility: str,
                     description: str = "") -> dict[str, Any]:
        self._require_active_agent(actor_id)
        if visibility not in VISIBILITIES:
            raise ValueError("visibility must be explicitly 'public' or 'private'")
        if not name.strip():
            raise ValueError("scene name is required")
        stamp, scene_id = now(), new_id("scene")
        with self.db:
            self.db.execute(
                "INSERT INTO scenes(scene_id,name,description,visibility,state,owner_agent_id,created_at,updated_at) "
                "VALUES(?,?,?,?,'open',?,?,?)",
                (scene_id, name.strip(), description, visibility, actor_id, stamp, stamp),
            )
            self.db.execute(
                "INSERT INTO memberships(scene_id,agent_id,role,can_interact,joined_at) VALUES(?,?,'owner',1,?)",
                (scene_id, actor_id, stamp),
            )
            self._event(scene_id, actor_id, "scene.created", {"visibility": visibility})
        return dict(self._scene(scene_id))

    def discover_public_scenes(self) -> list[dict[str, Any]]:
        rows = self.db.execute(
            "SELECT scene_id,name,description,visibility,state,owner_agent_id,version "
            "FROM scenes WHERE visibility='public' AND state='open' ORDER BY created_at"
        ).fetchall()
        return [dict(r) for r in rows]

    def join_scene(self, actor_id: str, scene_id: str, invitation_token: str | None = None) -> None:
        self._require_active_agent(actor_id)
        scene = self._scene(scene_id)
        if scene["state"] != "open":
            raise StateConflict("scene is not open for admission")
        if self.db.execute(
            "SELECT 1 FROM memberships WHERE scene_id=? AND agent_id=?", (scene_id, actor_id)
        ).fetchone():
            return  # idempotent join
        if scene["visibility"] == "private":
            if not invitation_token:
                raise PermissionDenied("private scene requires a valid invitation")
            inv = self.db.execute(
                "SELECT * FROM invitations WHERE scene_id=? AND token_hash=? AND revoked=0",
                (scene_id, token_hash(invitation_token)),
            ).fetchone()
            if not inv or (inv["invited_agent_id"] and inv["invited_agent_id"] != actor_id):
                raise PermissionDenied("invitation is invalid or not addressed to this agent")
            if inv["expires_at"] and inv["expires_at"] <= now():
                raise PermissionDenied("invitation has expired")
        stamp = now()
        with self.db:
            self.db.execute(
                "INSERT INTO memberships(scene_id,agent_id,role,can_interact,joined_at) VALUES(?,?,'member',1,?)",
                (scene_id, actor_id, stamp),
            )
            self._event(scene_id, actor_id, "scene.member_joined", {"agent_id": actor_id})
        # Invitations are reusable until expiry/revocation in this MVP; production policy may limit uses.

    def create_invitation(self, actor_id: str, scene_id: str,
                          invited_agent_id: str | None = None,
                          expires_at: str | None = None) -> str:
        self._require_active_agent(actor_id)
        scene = self._scene(scene_id)
        member = self._member(scene_id, actor_id)
        if member["role"] != "owner":
            raise PermissionDenied("only the scene owner may issue invitations in this MVP")
        if scene["state"] != "open":
            raise StateConflict("cannot invite into a non-open scene")
        if invited_agent_id:
            self._require_active_agent(invited_agent_id)
        token = secrets.token_urlsafe(32)
        with self.db:
            self.db.execute(
                "INSERT INTO invitations(invitation_id,scene_id,token_hash,invited_agent_id,expires_at,created_by,created_at) "
                "VALUES(?,?,?,?,?,?,?)",
                (new_id("inv"), scene_id, token_hash(token), invited_agent_id, expires_at, actor_id, now()),
            )
            self._event(scene_id, actor_id, "scene.invitation_created",
                        {"invited_agent_id": invited_agent_id, "expires_at": expires_at})
        return token

    def set_interaction_permission(self, actor_id: str, scene_id: str,
                                   target_agent_id: str, allowed: bool) -> None:
        self._require_active_agent(actor_id)
        self._member(scene_id, actor_id)
        scene = self._scene(scene_id)
        if scene["owner_agent_id"] != actor_id:
            raise PermissionDenied("only the scene owner may change interaction permission")
        with self.db:
            cur = self.db.execute(
                "UPDATE memberships SET can_interact=? WHERE scene_id=? AND agent_id=?",
                (1 if allowed else 0, scene_id, target_agent_id),
            )
            if cur.rowcount != 1:
                raise NotFound("target membership not found")
            self._event(scene_id, actor_id, "scene.interaction_permission_changed",
                        {"target_agent_id": target_agent_id, "allowed": bool(allowed)})

    def send_message(self, actor_id: str, scene_id: str, body: str) -> dict[str, str]:
        self._require_active_agent(actor_id)
        scene = self._scene(scene_id)
        member = self._member(scene_id, actor_id)
        if scene["state"] != "open":
            raise StateConflict("scene does not accept messages in its current state")
        if not member["can_interact"]:
            raise PermissionDenied("interaction permission is disabled")
        if not body.strip():
            raise ValueError("message body is required")
        message = {"message_id": new_id("msg"), "scene_id": scene_id,
                   "sender_agent_id": actor_id, "body": body, "created_at": now()}
        with self.db:
            self.db.execute(
                "INSERT INTO messages(message_id,scene_id,sender_agent_id,body,created_at) VALUES(?,?,?,?,?)",
                tuple(message[k] for k in ("message_id","scene_id","sender_agent_id","body","created_at")),
            )
            self._event(scene_id, actor_id, "message.created", {"message_id": message["message_id"]})
        return message

    def list_messages(self, actor_id: str, scene_id: str, limit: int = 50) -> list[dict[str, str]]:
        self._require_active_agent(actor_id)
        self._member(scene_id, actor_id)
        rows = self.db.execute(
            "SELECT message_id,scene_id,sender_agent_id,body,created_at FROM messages "
            "WHERE scene_id=? ORDER BY created_at,message_id LIMIT ?",
            (scene_id, max(1, min(limit, 200))),
        ).fetchall()
        return [dict(r) for r in rows]

    def list_events(self, actor_id: str, scene_id: str, limit: int = 100) -> list[dict[str, Any]]:
        self._require_active_agent(actor_id)
        self._member(scene_id, actor_id)
        rows = self.db.execute(
            "SELECT event_id,event_type,actor_agent_id,payload_json,created_at FROM events "
            "WHERE scene_id=? ORDER BY created_at,event_id LIMIT ?",
            (scene_id, max(1, min(limit, 500))),
        ).fetchall()
        return [dict(r) for r in rows]
