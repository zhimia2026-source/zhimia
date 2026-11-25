import tempfile
import unittest
from pathlib import Path

from video_studio.contracts import VideoPlan, VideoPlanError
from video_studio.planner import compile_edit_decision_list


class VideoStudioTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "assets").mkdir()
        (self.root / "assets" / "shot-01.mp4").write_bytes(b"placeholder")
        (self.root / "assets" / "music.wav").write_bytes(b"placeholder")

    def tearDown(self):
        self.temp.cleanup()

    def plan(self):
        return {
            "project_id": "aurora-short-001",
            "title": "Singapore Future City",
            "aspect_ratio": "9:16",
            "fps": 30,
            "resolution": "1080x1920",
            "assets": [
                {"asset_id": "shot1", "path": "assets/shot-01.mp4"},
                {"asset_id": "music1", "path": "assets/music.wav", "media_type": "audio"},
            ],
            "clips": [
                {"asset_id": "shot1", "timeline_start": 0, "source_start": 2, "source_end": 8, "track": 1, "role": "main"},
                {"asset_id": "music1", "timeline_start": 0, "source_start": 0, "source_end": 30, "track": 2, "role": "music"},
            ],
        }

    def test_compiles_valid_plan_and_resolves_local_assets(self):
        result = compile_edit_decision_list(self.plan(), self.root)
        self.assertEqual(result["schema"], "aurora-video-edit-decision-list/v1")
        self.assertEqual(len(result["timeline"]), 2)
        self.assertEqual(result["capcut"]["integration_status"], "not_connected")

    def test_rejects_path_traversal(self):
        raw = self.plan()
        raw["assets"][0]["path"] = "../outside.mp4"
        with self.assertRaisesRegex(VideoPlanError, "workspace_relative"):
            VideoPlan.parse(raw)

    def test_rejects_unknown_asset(self):
        raw = self.plan()
        raw["clips"][0]["asset_id"] = "missing"
        with self.assertRaisesRegex(VideoPlanError, "unknown_asset"):
            VideoPlan.parse(raw)

    def test_rejects_non_allowlisted_media_extension(self):
        raw = self.plan()
        raw["assets"][0]["path"] = "assets/evil.exe"
        with self.assertRaisesRegex(VideoPlanError, "extension_not_allowlisted"):
            VideoPlan.parse(raw)

    def test_rejects_audio_role_on_visual_asset(self):
        raw = self.plan()
        raw["clips"][0]["role"] = "music"
        with self.assertRaisesRegex(VideoPlanError, "audio_role_requires_audio_asset"):
            VideoPlan.parse(raw)

    def test_missing_local_asset_fails_closed(self):
        raw = self.plan()
        raw["assets"][0]["path"] = "assets/not-here.mp4"
        with self.assertRaisesRegex(VideoPlanError, "asset_file_missing"):
            compile_edit_decision_list(raw, self.root)

    def test_malformed_unhashable_values_are_rejected_cleanly(self):
        raw = self.plan()
        raw["aspect_ratio"] = []
        with self.assertRaisesRegex(VideoPlanError, "unsupported_aspect_ratio"):
            VideoPlan.parse(raw)
        raw = self.plan()
        raw["clips"][0]["role"] = []
        with self.assertRaisesRegex(VideoPlanError, "invalid_clip_role"):
            VideoPlan.parse(raw)

    def test_non_finite_timestamps_are_rejected(self):
        raw = self.plan()
        raw["clips"][0]["timeline_start"] = float("nan")
        with self.assertRaisesRegex(VideoPlanError, "clip_times_must_be_finite"):
            VideoPlan.parse(raw)


if __name__ == "__main__":
    unittest.main()
