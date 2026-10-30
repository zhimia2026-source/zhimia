"""Dependency-free WSGI adapter for the ZHI community reference engine.

Production deployments must inject an authentication callback backed by a trusted identity
provider. The adapter deliberately has no insecure default authentication implementation.
"""
from __future__ import annotations

import json
from typing import Callable
from urllib.parse import parse_qs

from zhi_community import CommunityError, NotFound, PermissionDenied, StateConflict, ZHICommunity

Authenticator = Callable[[str], str | None]


def make_app(community: ZHICommunity, authenticate: Authenticator):
    """Return a WSGI app. authenticate(bearer_token) returns a verified agent ID or None."""

    def app(environ, start_response):
        method = environ.get("REQUEST_METHOD", "GET").upper()
        path = environ.get("PATH_INFO", "/")
        request_id = environ.get("HTTP_X_REQUEST_ID", "")
        auth = environ.get("HTTP_AUTHORIZATION", "")
        if not auth.startswith("Bearer ") or not auth[7:].strip():
            return _respond(start_response, "401 Unauthorized",
                            {"error": "ZHI_AUTHENTICATION_REQUIRED", "request_id": request_id})
        actor_id = authenticate(auth[7:].strip())
        if not actor_id:
            return _respond(start_response, "401 Unauthorized",
                            {"error": "ZHI_IDENTITY_INVALID", "request_id": request_id})

        try:
            if method == "GET" and path == "/v1/scenes":
                return _respond(start_response, "200 OK",
                                {"items": community.discover_public_scenes(), "request_id": request_id})

            if method == "POST" and path == "/v1/scenes":
                body = _read_json(environ)
                scene = community.create_scene(
                    actor_id=actor_id, name=body.get("name", ""),
                    visibility=body.get("visibility"),
                    description=body.get("description", ""),
                )
                return _respond(start_response, "201 Created",
                                {"scene": scene, "request_id": request_id})

            parts = [p for p in path.split("/") if p]
            if len(parts) == 4 and parts[:2] == ["v1", "scenes"] and parts[3] == "state" and method == "POST":
                body = _read_json(environ)
                scene = community.transition_scene(actor_id, parts[2], body.get("state"))
                return _respond(start_response, "200 OK",
                                {"scene": scene, "request_id": request_id})

            if len(parts) == 4 and parts[:2] == ["v1", "scenes"] and parts[3] == "join" and method == "POST":
                body = _read_json(environ)
                community.join_scene(actor_id, parts[2], body.get("invitation_token"))
                return _respond(start_response, "200 OK",
                                {"scene_id": parts[2], "membership": "active", "request_id": request_id})

            if len(parts) == 4 and parts[:2] == ["v1", "scenes"] and parts[3] == "messages":
                scene_id = parts[2]
                if method == "GET":
                    query = parse_qs(environ.get("QUERY_STRING", ""))
                    try:
                        limit = int(query.get("limit", ["50"])[0])
                    except ValueError:
                        return _respond(start_response, "400 Bad Request",
                                        {"error": "ZHI_INVALID_ARGUMENT", "request_id": request_id})
                    return _respond(start_response, "200 OK",
                                    {"items": community.list_messages(actor_id, scene_id, limit),
                                     "request_id": request_id})
                if method == "POST":
                    body = _read_json(environ)
                    message = community.send_message(actor_id, scene_id, body.get("body", ""))
                    return _respond(start_response, "201 Created",
                                    {"message": message, "request_id": request_id})


            if len(parts) == 4 and parts[:2] == ["v1", "scenes"] and parts[3] == "tasks" and method == "POST":
                body = _read_json(environ)
                key = environ.get("HTTP_IDEMPOTENCY_KEY", "").strip()
                task, created = community.create_task(actor_id, parts[2], body.get("action"), key)
                return _respond(start_response, "201 Created" if created else "200 OK",
                                {"task": task, "created": created, "request_id": request_id})

            if len(parts) == 3 and parts[:2] == ["v1", "tasks"] and method == "GET":
                task = community.get_task(actor_id, parts[2])
                return _respond(start_response, "200 OK", {"task": task, "request_id": request_id})

            if len(parts) == 4 and parts[:2] == ["v1", "tasks"] and parts[3] == "cancel" and method == "POST":
                task = community.cancel_task(actor_id, parts[2])
                return _respond(start_response, "200 OK", {"task": task, "request_id": request_id})

            if len(parts) == 4 and parts[:2] == ["v1", "tasks"] and parts[3] == "state" and method == "POST":
                body = _read_json(environ)
                task = community.transition_task(actor_id, parts[2], body.get("status"),
                                                 result=body.get("result"), error=body.get("error"))
                return _respond(start_response, "200 OK", {"task": task, "request_id": request_id})

            return _respond(start_response, "404 Not Found",
                            {"error": "ZHI_RESOURCE_NOT_FOUND", "request_id": request_id})
        except PermissionDenied:
            return _respond(start_response, "403 Forbidden",
                            {"error": "ZHI_PERMISSION_DENIED", "request_id": request_id})
        except NotFound:
            return _respond(start_response, "404 Not Found",
                            {"error": "ZHI_RESOURCE_NOT_FOUND", "request_id": request_id})
        except StateConflict:
            return _respond(start_response, "409 Conflict",
                            {"error": "ZHI_STATE_CONFLICT", "request_id": request_id})
        except (ValueError, TypeError, json.JSONDecodeError):
            return _respond(start_response, "400 Bad Request",
                            {"error": "ZHI_INVALID_ARGUMENT", "request_id": request_id})

    return app


def _read_json(environ):
    try:
        length = int(environ.get("CONTENT_LENGTH") or "0")
    except ValueError as exc:
        raise ValueError("invalid content length") from exc
    if length < 0 or length > 1_000_000:
        raise ValueError("request body too large")
    raw = environ["wsgi.input"].read(length) if length else b"{}"
    value = json.loads(raw.decode("utf-8"))
    if not isinstance(value, dict):
        raise ValueError("JSON request body must be an object")
    return value


def _respond(start_response, status, payload):
    data = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
    start_response(status, [
        ("Content-Type", "application/json; charset=utf-8"),
        ("Content-Length", str(len(data))),
        ("Cache-Control", "no-store"),
        ("X-Content-Type-Options", "nosniff"),
    ])
    return [data]
