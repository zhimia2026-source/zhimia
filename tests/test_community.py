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

    def test_suspended_agent_cannot_join(self):
        scene = self.app.create_scene("alice", "Square", "public")
        self.app.db.execute("UPDATE agents SET status='suspended' WHERE agent_id='bob'")
        self.app.db.commit()
        with self.assertRaises(PermissionDenied):
            self.app.join_scene("bob", scene["scene_id"])


if __name__ == "__main__":
    unittest.main()
