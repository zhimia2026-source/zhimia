import tempfile
import unittest
from pathlib import Path

from windows_worker.aurora_video_worker import discover_jianying, scan_workspace


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

    def test_diagnostic_is_read_only_and_platform_aware(self):
        result = discover_jianying()
        self.assertIn(result["status"], {"unsupported_os", "detected", "not_found", "diagnostic_failed", "invalid_diagnostic_output"})


if __name__ == "__main__":
    unittest.main()
