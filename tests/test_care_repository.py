import os
import tempfile
import unittest

from zhi_care import CareAccessError, CareEvidence, CareState, CareStatus, EpistemicStatus
from zhi_care_repository import CareNotFound, CareRepository, CareRevisionConflict


def sample_care(care_id="care:persist:001", owner="agent:owner"):
    return CareState(
        care_id=care_id,
        subject_ref=owner,
        target_ref="other:person:001",
        care_focus=("stated_need", "continuity"),
    )


class CareRepositoryTests(unittest.TestCase):
    def setUp(self):
        self.repo = CareRepository()
        self.care = sample_care()
        self.repo.create(self.care)

    def tearDown(self):
        self.repo.close()

    def test_create_and_load_round_trip(self):
        loaded = self.repo.get("agent:owner", self.care.care_id)
        self.assertEqual(loaded.care_id, self.care.care_id)
        self.assertEqual(loaded.status, CareStatus.DISCOVERED)
        self.assertEqual(loaded.access_policy, "private")
        self.assertEqual(loaded.care_focus, ("stated_need", "continuity"))

    def test_private_record_is_not_discoverable_by_another_owner(self):
        with self.assertRaises(CareNotFound):
            self.repo.get("agent:intruder", self.care.care_id)
        self.assertEqual(self.repo.list_for_owner("agent:intruder"), [])

    def test_evidence_and_transition_history_survive_round_trip(self):
        loaded = self.repo.get("agent:owner", self.care.care_id)
        loaded.add_evidence(
            "agent:owner",
            CareEvidence("event:001", EpistemicStatus.REPORTED, source_ref="message:001"),
        )
        loaded.transition("agent:owner", CareStatus.UNDERSTANDING, reason="message_received")
        self.repo.save("agent:owner", loaded, expected_revision=1)
        again = self.repo.get("agent:owner", self.care.care_id)
        self.assertEqual(again.revision, 3)
        self.assertEqual(again.evidence[0].status, EpistemicStatus.REPORTED)
        self.assertEqual(again.history[-1]["to"], "understanding")

    def test_optimistic_revision_prevents_stale_overwrite(self):
        first = self.repo.get("agent:owner", self.care.care_id)
        stale = self.repo.get("agent:owner", self.care.care_id)
        first.transition("agent:owner", CareStatus.UNDERSTANDING, reason="new_evidence")
        self.repo.save("agent:owner", first, expected_revision=1)
        stale.transition("agent:owner", CareStatus.UNDERSTANDING, reason="stale_update")
        with self.assertRaises(CareRevisionConflict):
            self.repo.save("agent:owner", stale, expected_revision=1)
        saved = self.repo.get("agent:owner", self.care.care_id)
        self.assertEqual(saved.history[-1]["reason"], "new_evidence")

    def test_save_cannot_cross_owner_boundary(self):
        loaded = self.repo.get("agent:owner", self.care.care_id)
        with self.assertRaises(CareAccessError):
            self.repo.save("agent:intruder", loaded, expected_revision=1)

    def test_owner_list_returns_metadata_not_evidence_payload(self):
        rows = self.repo.list_for_owner("agent:owner")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["care_id"], self.care.care_id)
        self.assertNotIn("payload_json", rows[0])

    def test_duplicate_care_id_rejected(self):
        with self.assertRaisesRegex(ValueError, "care_id_already_exists"):
            self.repo.create(sample_care())

    def test_persistence_survives_repository_reopen(self):
        self.repo.close()
        self.repo = None
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "care.sqlite3")
            first = CareRepository(path)
            first.create(sample_care("care:disk:001"))
            first.close()
            second = CareRepository(path)
            try:
                loaded = second.get("agent:owner", "care:disk:001")
                self.assertEqual(loaded.target_ref, "other:person:001")
            finally:
                second.close()


if __name__ == "__main__":
    unittest.main()
