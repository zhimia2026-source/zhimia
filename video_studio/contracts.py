"""Strict input contract for resident-authored video edit plans.

The contract deliberately accepts workspace-relative asset paths only. It never
accepts shell commands, arbitrary scripts, URLs to download, or absolute paths.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
import math
import re
from typing import Any

_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")
_ALLOWED_MEDIA = {".mp4", ".mov", ".m4v", ".mkv", ".webm", ".mp3", ".wav", ".m4a", ".aac", ".png", ".jpg", ".jpeg", ".webp"}
MAX_ASSETS = 200
MAX_CLIPS = 500
MAX_SECONDS = 60 * 60 * 4
MAX_PLAN_BYTES = 512_000


class VideoPlanError(ValueError):
    """Raised when a resident edit plan is invalid."""


@dataclass(frozen=True)
class Asset:
    asset_id: str
    path: str
    media_type: str


@dataclass(frozen=True)
class Clip:
    asset_id: str
    timeline_start: float
    source_start: float
    source_end: float
    track: int
    role: str


@dataclass(frozen=True)
class VideoPlan:
    project_id: str
    title: str
    aspect_ratio: str
    fps: int
    resolution: str
    assets: tuple[Asset, ...]
    clips: tuple[Clip, ...]

    @classmethod
    def parse(cls, raw: Any) -> "VideoPlan":
        if not isinstance(raw, dict):
            raise VideoPlanError("plan_must_be_object")
        encoded = json.dumps(raw, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if len(encoded) > MAX_PLAN_BYTES:
            raise VideoPlanError("plan_too_large")

        project_id = raw.get("project_id")
        if not isinstance(project_id, str) or not _ID.fullmatch(project_id):
            raise VideoPlanError("invalid_project_id")
        title = raw.get("title")
        if not isinstance(title, str) or not title.strip() or len(title) > 160:
            raise VideoPlanError("invalid_title")

        aspect = raw.get("aspect_ratio", "9:16")
        if not isinstance(aspect, str) or aspect not in {"9:16", "16:9", "1:1", "4:5"}:
            raise VideoPlanError("unsupported_aspect_ratio")
        fps = raw.get("fps", 30)
        if isinstance(fps, bool) or not isinstance(fps, int) or fps not in {24, 25, 30, 50, 60}:
            raise VideoPlanError("unsupported_fps")
        resolution = raw.get("resolution", "1080x1920" if aspect == "9:16" else "1920x1080")
        if not isinstance(resolution, str) or resolution not in {"720x1280", "1080x1920", "1280x720", "1920x1080", "1080x1080"}:
            raise VideoPlanError("unsupported_resolution")

        raw_assets = raw.get("assets")
        if not isinstance(raw_assets, list) or not 1 <= len(raw_assets) <= MAX_ASSETS:
            raise VideoPlanError("assets_must_be_nonempty_list")
        assets: list[Asset] = []
        seen: set[str] = set()
        for item in raw_assets:
            if not isinstance(item, dict):
                raise VideoPlanError("asset_must_be_object")
            asset_id, path = item.get("asset_id"), item.get("path")
            if not isinstance(asset_id, str) or not _ID.fullmatch(asset_id) or asset_id in seen:
                raise VideoPlanError("invalid_or_duplicate_asset_id")
            if not isinstance(path, str) or not path or len(path) > 240 or "\\" in path:
                raise VideoPlanError("invalid_asset_path")
            parts = path.split("/")
            if path.startswith("/") or any(p in {"", ".", ".."} for p in parts):
                raise VideoPlanError("asset_path_must_be_workspace_relative")
            suffix = "." + path.rsplit(".", 1)[-1].lower() if "." in path else ""
            if suffix not in _ALLOWED_MEDIA:
                raise VideoPlanError("asset_extension_not_allowlisted")
            media_type = item.get("media_type", "audio" if suffix in {".mp3", ".wav", ".m4a", ".aac"} else "visual")
            if not isinstance(media_type, str) or media_type not in {"visual", "audio"}:
                raise VideoPlanError("invalid_media_type")
            assets.append(Asset(asset_id, path, media_type))
            seen.add(asset_id)

        raw_clips = raw.get("clips")
        if not isinstance(raw_clips, list) or not 1 <= len(raw_clips) <= MAX_CLIPS:
            raise VideoPlanError("clips_must_be_nonempty_list")
        clips: list[Clip] = []
        for item in raw_clips:
            if not isinstance(item, dict):
                raise VideoPlanError("clip_must_be_object")
            asset_id = item.get("asset_id")
            if not isinstance(asset_id, str) or asset_id not in seen:
                raise VideoPlanError("clip_references_unknown_asset")
            start, source_start, source_end = (item.get(k) for k in ("timeline_start", "source_start", "source_end"))
            values = (start, source_start, source_end)
            if any(isinstance(v, bool) or not isinstance(v, (int, float)) for v in values):
                raise VideoPlanError("clip_times_must_be_numbers")
            if any(not math.isfinite(v) for v in values):
                raise VideoPlanError("clip_times_must_be_finite")
            if start < 0 or source_start < 0 or source_end <= source_start or source_end > MAX_SECONDS or start > MAX_SECONDS:
                raise VideoPlanError("clip_times_out_of_range")
            track = item.get("track", 1)
            if isinstance(track, bool) or not isinstance(track, int) or not 1 <= track <= 8:
                raise VideoPlanError("invalid_track")
            role = item.get("role", "main")
            if not isinstance(role, str) or role not in {"main", "broll", "voiceover", "music", "subtitle"}:
                raise VideoPlanError("invalid_clip_role")
            clips.append(Clip(asset_id, float(start), float(source_start), float(source_end), track, role))

        assets_by_id = {a.asset_id: a for a in assets}
        for clip in clips:
            if clip.role in {"music", "voiceover"} and assets_by_id[clip.asset_id].media_type != "audio":
                raise VideoPlanError("audio_role_requires_audio_asset")
        return cls(project_id, title.strip(), aspect, int(fps), resolution, tuple(assets), tuple(clips))
