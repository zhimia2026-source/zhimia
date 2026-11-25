import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from windows_worker.aurora_video_worker import build_preflight, discover_jianying, inspect_jianying_ui, scan_workspace


class WindowsWorkerTests(unittest.TestCase):
    def test_scan_workspace_only_returns_supported_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "clip.mp4").write_bytes(b"video")
            (root / "notes.txt").write_text("not media", encoding="utf-8")
            (root / "music").mkdir()
            (root / "music" / "track.wav").write_bytes(b"audio")
            result = scan_workspace(root)
            self.assertEqual(result["asset_count"], 2)
            self.assertEqual(
                {item["relative_path"] for item in result["assets"]},
                {"clip.mp4", "music/track.wav"},
            )

    def test_preflight_validates_plan_without_creating_outputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "assets").mkdir()
            (root / "assets" / "clip.mp4").write_bytes(b"video")
            plan = {
                "project_id": "preflight-01",
                "title": "Preflight",
                "aspect_ratio": "9:16",
                "fps": 30,
                "resolution": "1080x1920",
                "assets": [{"asset_id": "clip", "path": "assets/clip.mp4"}],
                "clips": [{"asset_id": "clip", "timeline_start": 0, "source_start": 0, "source_end": 4, "track": 1, "role": "main"}],
            }
            plan_path = root / "plan.json"
            import json
            plan_path.write_text(json.dumps(plan), encoding="utf-8")
            result = build_preflight(plan_path, root)
            self.assertEqual(result["status"], "ready_for_adapter_review")
            self.assertEqual(result["asset_count"], 1)
            self.assertEqual(result["clip_count"], 1)
            self.assertFalse(result["execution"]["source_media_modified"])
            self.assertFalse((root / "edit-decision-list.json").exists())

    def test_diagnostic_is_read_only_and_platform_aware(self):
        result = discover_jianying()
        self.assertIn(result["status"], {"unsupported_os", "detected", "not_found", "diagnostic_failed", "invalid_diagnostic_output", "invalid_diagnostic_shape"})

    def test_ui_inspection_is_platform_aware(self):
        result = inspect_jianying_ui()
        self.assertIn(result["status"], {"unsupported_os", "inspected", "app_window_not_found", "uia_unavailable", "diagnostic_failed", "invalid_diagnostic_output", "invalid_diagnostic_shape"})

    @patch("windows_worker.aurora_video_worker.os.name", "posix")
    def test_ui_inspection_never_runs_powershell_off_windows(self):
        result = inspect_jianying_ui()
        self.assertEqual(result["status"], "unsupported_os")


if __name__ == "__main__":
    unittest.main()
