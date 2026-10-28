#!/usr/bin/env python3
"""Live smoke test for the deployed ZHI Care API.

Requires:
  ZHI_SUPABASE_URL=https://<project-ref>.supabase.co
  ZHI_ACCESS_TOKEN=<valid Supabase access token>

Optional:
  ZHI_SECOND_ACCESS_TOKEN=<valid token for a different user>

This creates one synthetic care record. The API intentionally has no delete
operation yet, so the record remains for audit/inspection.
"""
from __future__ import annotations

import json
import os
import secrets
import sys
import urllib.error
import urllib.request
from typing import Any

BASE_URL = os.environ.get(
    "ZHI_SUPABASE_URL", "https://lvxmygrgqtmzqgailmyl.supabase.co"
).rstrip("/")
ACCESS_TOKEN = os.environ.get("ZHI_ACCESS_TOKEN", "").strip()
SECOND_TOKEN = os.environ.get("ZHI_SECOND_ACCESS_TOKEN", "").strip()
FUNCTION_URL = f"{BASE_URL}/functions/v1/zhi-care"


class ApiError(AssertionError):
    pass


def call(token: str, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    request = urllib.request.Request(
        FUNCTION_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "apikey": os.environ.get("SUPABASE_PUBLISHABLE_KEY") or os.environ.get("SUPABASE_ANON_KEY", ""),
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        response = urllib.request.urlopen(request, timeout=20)
        status = response.status
        raw = response.read()
    except urllib.error.HTTPError as exc:
        status = exc.code
        raw = exc.read()
    try:
        body = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        body = {"raw_response": raw[:200].decode("utf-8", errors="replace")}
    return status, body


def expect(condition: bool, message: str) -> None:
    if not condition:
        raise ApiError(message)
    print(f"PASS: {message}")


def main() -> int:
    if not ACCESS_TOKEN:
        print("Set ZHI_ACCESS_TOKEN to a valid Supabase access token.", file=sys.stderr)
        return 2

    care_id = f"smoke:{secrets.token_hex(8)}"
    status, created = call(ACCESS_TOKEN, {
        "action": "create",
        "care_id": care_id,
        "target_ref": "test:synthetic-subject",
        "care_focus": ["api_smoke_test"],
    })
    expect(status == 201 and created.get("care", {}).get("care_id") == care_id,
           "authenticated create returns 201")
    expect(created["care"].get("access_policy") == "private",
           "new record is private by default")
    expect(created["care"].get("revision") == 1,
           "new record starts at revision 1")

    status, listed = call(ACCESS_TOKEN, {"action": "list", "limit": 100})
    expect(status == 200 and any(x.get("care_id") == care_id for x in listed.get("items", [])),
           "list returns the caller's record")

    status, fetched = call(ACCESS_TOKEN, {"action": "get", "care_id": care_id})
    expect(status == 200 and fetched.get("care", {}).get("care_id") == care_id,
           "get returns the caller's record and event history")
    expect(any(e.get("event_type") == "created" for e in fetched.get("events", [])),
           "creation event is recorded")

    status, evidence = call(ACCESS_TOKEN, {
        "action": "add_evidence",
        "care_id": care_id,
        "evidence_ref": f"synthetic-evidence:{secrets.token_hex(4)}",
        "evidence_status": "reported",
    })
    expect(status == 200 and evidence.get("care", {}).get("revision") == 2,
           "adding evidence advances revision")

    status, transitioned = call(ACCESS_TOKEN, {
        "action": "transition",
        "care_id": care_id,
        "to_state": "understanding",
        "reason_code": "api_smoke_test",
    })
    expect(status == 200 and transitioned.get("care", {}).get("state") == "understanding",
           "valid state transition succeeds")

    status, goal = call(ACCESS_TOKEN, {
        "action": "transition", "care_id": care_id, "to_state": "goal_set",
        "reason_code": "api_smoke_test",
    })
    expect(status == 200 and goal.get("care", {}).get("state") == "goal_set",
           "transition to goal_set succeeds")

    status, review = call(ACCESS_TOKEN, {
        "action": "transition", "care_id": care_id, "to_state": "action_review",
        "reason_code": "api_smoke_test",
    })
    expect(status == 200 and review.get("care", {}).get("state") == "action_review",
           "transition to action_review succeeds")

    status, blocked = call(ACCESS_TOKEN, {
        "action": "transition", "care_id": care_id, "to_state": "in_progress",
        "reason_code": "api_smoke_test", "approved": True,
    })
    expect(status == 403 and blocked.get("error") == "approved_ticket_required",
           "client-supplied approval cannot bypass the supervised action gate")

    status, requested = call(ACCESS_TOKEN, {"action": "request_approval", "care_id": care_id})
    expect(status == 201 and requested.get("ticket", {}).get("status") == "pending",
           "approval request creates a pending, scoped ticket")
    ticket_id = requested["ticket"]["ticket_id"]

    status, approved = call(ACCESS_TOKEN, {"action": "approve_action", "ticket_id": ticket_id})
    expect(status == 200 and approved.get("ticket", {}).get("status") == "approved",
           "explicit approval changes ticket status to approved")

    status, started = call(ACCESS_TOKEN, {
        "action": "transition", "care_id": care_id, "to_state": "in_progress",
        "ticket_id": ticket_id, "reason_code": "human_approved",
    })
    expect(status == 200 and started.get("care", {}).get("state") == "in_progress",
           "valid approved ticket permits the scoped workflow transition")

    status, replay = call(ACCESS_TOKEN, {
        "action": "transition", "care_id": care_id, "to_state": "in_progress",
        "ticket_id": ticket_id, "reason_code": "ticket_replay_test",
    })
    expect(status == 409,
           "a consumed ticket cannot be replayed")

    status, duplicate = call(ACCESS_TOKEN, {
        "action": "create",
        "care_id": care_id,
        "target_ref": "test:synthetic-subject",
    })
    expect(status == 409 and duplicate.get("error") == "care_id_already_exists",
           "duplicate care ID returns HTTP 409")

    if SECOND_TOKEN:
        status, other_user = call(SECOND_TOKEN, {"action": "get", "care_id": care_id})
        expect(status == 404 and other_user.get("error") == "care_not_found",
               "second user cannot discover the first user's record")
    else:
        print("SKIP: set ZHI_SECOND_ACCESS_TOKEN to run cross-account isolation check")

    print(f"Smoke test complete. Synthetic care_id={care_id}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ApiError, urllib.error.URLError, TimeoutError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        raise SystemExit(1)
