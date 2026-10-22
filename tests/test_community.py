import unittest

from zhi_community import ZHICommunity, PermissionDenied, StateConflict


class CommunityTests(unittest.TestCase):
    def setUp(self):
        self.app = ZHICommunity()
        for agent in ("alice", "bob", "mallory"):
            self.app.register_agent(agent, agent.title())

    def tearDown(self):
        self.app.close()

    def test_visibility_is_mandatory_and_public_discovery_excludes_private(self):
        with self.assertRaises(TypeError):
            self.app.create_scene("alice", "missing visibility")
        public = self.app.create_scene("alice", "Town Square", "public")
        private = self.app.create_scene("alice", "Private Room", "private")
        found = [s["scene_id"] for s in self.app.discover_public_scenes()]
        self.assertIn(public["scene_id"], found)
        self.assertNotIn(private["scene_id"], found)

    def test_public_scene_admits_active_agent_but_membership_is_required_to_chat(self):
        scene = self.app.create_scene("alice", "Square", "public")
        self.app.join_scene("bob", scene["scene_id"])
        msg = self.app.send_message("bob", scene["scene_id"], "Hello community")
        self.assertEqual(msg["sender_agent_id"], "bob")
        with self.assertRaises(PermissionDenied):
            self.app.send_message("mallory", scene["scene_id"], "Not a member")

    def test_private_scene_requires_invitation_and_can_target_identity(self):
        scene = self.app.create_scene("alice", "Private", "private")
        with self.assertRaises(PermissionDenied):
            self.app.join_scene("bob", scene["scene_id"])
        token = self.app.create_invitation("alice", scene["scene_id"], invited_agent_id="bob")
        with self.assertRaises(PermissionDenied):
            self.app.join_scene("mallory", scene["scene_id"], token)
        self.app.join_scene("bob", scene["scene_id"], token)
        self.assertEqual(len(self.app.list_messages("bob", scene["scene_id"])), 0)

    def test_permissions_are_separate_from_membership(self):
        scene = self.app.create_scene("alice", "Square", "public")
        self.app.join_scene("bob", scene["scene_id"])
        self.app.set_interaction_permission("alice", scene["scene_id"], "bob", False)
        with self.assertRaises(PermissionDenied):
            self.app.send_message("bob", scene["scene_id"], "Blocked")
        # Membership remains, but interaction permission is independently denied.
        self.assertEqual(self.app.list_messages("bob", scene["scene_id"]), [])

    def test_closed_scene_rejects_admission_and_messages(self):
        scene = self.app.create_scene("alice", "Square", "public")
        self.app.db.execute("UPDATE scenes SET state='closed' WHERE scene_id=?", (scene["scene_id"],))
        self.app.db.commit()
        with self.assertRaises(StateConflict):
            self.app.join_scene("bob", scene["scene_id"])
        with self.assertRaises(StateConflict):
            self.app.send_message("alice", scene["scene_id"], "Closed")

    def test_scene_lifecycle_is_owner_controlled_and_versioned(self):
        scene = self.app.create_scene("alice", "Lifecycle", "public")
        with self.assertRaises(PermissionDenied):
            self.app.transition_scene("bob", scene["scene_id"], "paused")
        paused = self.app.transition_scene("alice", scene["scene_id"], "paused")
        self.assertEqual(paused["state"], "paused")
        self.assertEqual(paused["version"], scene["version"] + 1)
        with self.assertRaises(StateConflict):
            self.app.join_scene("bob", scene["scene_id"])
        reopened = self.app.transition_scene("alice", scene["scene_id"], "open")
        self.assertEqual(reopened["state"], "open")
        closed = self.app.transition_scene("alice", scene["scene_id"], "closed")
        self.assertEqual(closed["state"], "closed")
        with self.assertRaises(StateConflict):
            self.app.transition_scene("alice", scene["scene_id"], "open")

    def test_task_idempotency_and_payload_conflict(self):
        scene = self.app.create_scene("alice", "Task room", "public")
        self.app.join_scene("bob", scene["scene_id"])
        first, created = self.app.create_task("bob", scene["scene_id"], {"type": "summarize", "text": "hello"}, "req-1")
        self.assertTrue(created)
        same, created_again = self.app.create_task("bob", scene["scene_id"], {"text": "hello", "type": "summarize"}, "req-1")
        self.assertFalse(created_again)
        self.assertEqual(first["task_id"], same["task_id"])
        self.assertEqual(first["status"], "CREATED")
        with self.assertRaises(StateConflict):
            self.app.create_task("bob", scene["scene_id"], {"type": "delete"}, "req-1")

    def test_task_state_machine_permissions_result_and_cancel(self):
        scene = self.app.create_scene("alice", "Task room", "public")
        self.app.join_scene("bob", scene["scene_id"])
        task, _ = self.app.create_task("bob", scene["scene_id"], {"type": "draft"}, "draft-1")
        with self.assertRaises(PermissionDenied):
            self.app.transition_task("bob", task["task_id"], "QUEUED")
        queued = self.app.transition_task("alice", task["task_id"], "QUEUED")
        running = self.app.transition_task("alice", task["task_id"], "RUNNING")
        requested = self.app.cancel_task("bob", task["task_id"])
        self.assertEqual(requested["status"], "CANCEL_REQUESTED")
        cancelled = self.app.transition_task("alice", task["task_id"], "CANCELLED")
        self.assertEqual(cancelled["status"], "CANCELLED")
        with self.assertRaises(StateConflict):
            self.app.transition_task("alice", task["task_id"], "RUNNING")

    def test_task_completion_requires_confirmed_result(self):
        scene = self.app.create_scene("alice", "Task room", "public")
        self.app.join_scene("bob", scene["scene_id"])
        task, _ = self.app.create_task("bob", scene["scene_id"], {"type": "report"}, "report-1")
        self.app.transition_task("alice", task["task_id"], "QUEUED")
        self.app.transition_task("alice", task["task_id"], "RUNNING")
        self.app.transition_task("alice", task["task_id"], "COMPLETING")
        with self.assertRaises(ValueError):
            self.app.transition_task("alice", task["task_id"], "COMPLETED")
        completed = self.app.transition_task("alice", task["task_id"], "COMPLETED",
                                             result={"confirmed": True, "summary": "done"})
        self.assertEqual(completed["result"]["confirmed"], True)

    def test_task_requires_interaction_permission_and_open_scene(self):
        scene = self.app.create_scene("alice", "Task room", "public")
        self.app.join_scene("bob", scene["scene_id"])
        self.app.set_interaction_permission("alice", scene["scene_id"], "bob", False)
        with self.assertRaises(PermissionDenied):
            self.app.create_task("bob", scene["scene_id"], {"type": "draft"}, "no-interaction")
        self.app.set_interaction_permission("alice", scene["scene_id"], "bob", True)
        self.app.transition_scene("alice", scene["scene_id"], "paused")
        with self.assertRaises(StateConflict):
            self.app.create_task("bob", scene["scene_id"], {"type": "draft"}, "paused-scene")

    def test_suspended_agent_cannot_join(self):
        scene = self.app.create_scene("alice", "Square", "public")
        self.app.db.execute("UPDATE agents SET status='suspended' WHERE agent_id='bob'")
        self.app.db.commit()
        with self.assertRaises(PermissionDenied):
            self.app.join_scene("bob", scene["scene_id"])


if __name__ == "__main__":
    unittest.main()
