import unittest

from zhi_care import CareAccessError, CareError, CareEvidence, CareState, CareStatus, EpistemicStatus


class CareStateTests(unittest.TestCase):
    def setUp(self):
        self.care = CareState(
            care_id="care:example:001",
            subject_ref="agent:zhi:manager",
            target_ref="other:user:001",
            care_focus=("stated_need", "relationship_continuity"),
        )

    def test_default_state_is_unknown_and_private(self):
        payload = self.care.to_dict()
        self.assertEqual(payload["state"], "discovered")
        self.assertEqual(payload["epistemic_status"], "unknown")
        self.assertEqual(payload["access_policy"], "private")

    def test_other_agent_cannot_read_or_mutate_private_record(self):
        with self.assertRaisesRegex(CareAccessError, "private_care_access_denied"):
            self.care.assert_access("agent:zhi:other")
        with self.assertRaises(CareAccessError):
            self.care.transition("agent:zhi:other", CareStatus.UNDERSTANDING, reason="try")

    def test_transition_records_revision_and_history(self):
        self.care.transition("agent:zhi:manager", CareStatus.UNDERSTANDING, reason="message_received")
        self.assertEqual(self.care.revision, 2)
        self.assertEqual(self.care.history[-1]["from"], "discovered")
        self.assertEqual(self.care.history[-1]["to"], "understanding")

    def test_invalid_transition_is_rejected(self):
        with self.assertRaisesRegex(CareError, "invalid_transition"):
            self.care.transition("agent:zhi:manager", CareStatus.IN_PROGRESS, reason="skip_review")

    def test_action_requires_permission_capability_and_risk_check(self):
        self.care.transition("agent:zhi:manager", CareStatus.UNDERSTANDING, reason="understand")
        self.care.transition("agent:zhi:manager", CareStatus.GOAL_SET, reason="goal_defined")
        self.care.transition("agent:zhi:manager", CareStatus.ACTION_REVIEW, reason="review")
        with self.assertRaisesRegex(CareError, "action_permission_required"):
            self.care.transition("agent:zhi:manager", CareStatus.IN_PROGRESS, reason="act",
                                 capability_confirmed=True, risk_checked=True)
        with self.assertRaisesRegex(CareError, "action_capability_unconfirmed"):
            self.care.transition("agent:zhi:manager", CareStatus.IN_PROGRESS, reason="act",
                                 permission_granted=True, risk_checked=True)
        with self.assertRaisesRegex(CareError, "action_risk_check_required"):
            self.care.transition("agent:zhi:manager", CareStatus.IN_PROGRESS, reason="act",
                                 permission_granted=True, capability_confirmed=True)
        self.care.transition("agent:zhi:manager", CareStatus.IN_PROGRESS, reason="approved_action",
                             permission_granted=True, capability_confirmed=True, risk_checked=True)
        self.assertEqual(self.care.status, CareStatus.IN_PROGRESS)

    def test_terminal_state_cannot_be_reopened(self):
        self.care.transition("agent:zhi:manager", CareStatus.UNDERSTANDING, reason="step")
        self.care.transition("agent:zhi:manager", CareStatus.GOAL_SET, reason="step")
        self.care.transition("agent:zhi:manager", CareStatus.ACTION_REVIEW, reason="step")
        self.care.transition("agent:zhi:manager", CareStatus.IN_PROGRESS, reason="step",
                             permission_granted=True, capability_confirmed=True, risk_checked=True)
        self.care.transition("agent:zhi:manager", CareStatus.FEEDBACK_REVIEW, reason="step")
        self.care.transition("agent:zhi:manager", CareStatus.RESOLVED, reason="goal_met")
        with self.assertRaisesRegex(CareError, "invalid_transition"):
            self.care.transition("agent:zhi:manager", CareStatus.UNDERSTANDING, reason="reopen")

    def test_evidence_keeps_epistemic_status(self):
        self.care.add_evidence(
            "agent:zhi:manager",
            CareEvidence("event:message:001", EpistemicStatus.REPORTED, source_ref="msg:one"),
        )
        data = self.care.to_dict()
        self.assertEqual(data["evidence"][0]["status"], "reported")
        self.assertEqual(data["evidence"][0]["source_ref"], "msg:one")

    def test_duplicate_evidence_reference_is_rejected(self):
        item = CareEvidence("event:message:001", EpistemicStatus.OBSERVED)
        self.care.add_evidence("agent:zhi:manager", item)
        with self.assertRaisesRegex(CareError, "duplicate_evidence_ref"):
            self.care.add_evidence("agent:zhi:manager", item)

    def test_public_access_policy_is_rejected(self):
        with self.assertRaisesRegex(CareError, "care_records_must_be_private"):
            CareState("care:bad", "agent:zhi:manager", "other:user:001", access_policy="public")

    def test_same_subject_and_target_is_rejected(self):
        with self.assertRaisesRegex(CareError, "care_subject_target_must_differ"):
            CareState("care:bad", "agent:zhi:a", "agent:zhi:a")


if __name__ == "__main__":
    unittest.main()
