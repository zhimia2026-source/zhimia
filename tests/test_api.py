import io
import json
import unittest

from zhi_community import ZHICommunity
from zhi_api import make_app


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.community = ZHICommunity()
        self.community.register_agent("alice", "Alice")
        self.community.register_agent("bob", "Bob")
        self.scene = self.community.create_scene("alice", "Public square", "public")
        self.community.join_scene("bob", self.scene["scene_id"])
        self.app = make_app(self.community, lambda token: {"alice-token": "alice", "bob-token": "bob"}.get(token))

    def tearDown(self):
        self.community.close()

    def request(self, method, path, token=None, body=None, query=""):
        raw = json.dumps(body or {}).encode()
        environ = {
            "REQUEST_METHOD": method, "PATH_INFO": path, "QUERY_STRING": query,
            "CONTENT_LENGTH": str(len(raw)), "wsgi.input": io.BytesIO(raw),
            "HTTP_X_REQUEST_ID": "test-request-1",
        }
        if token:
            environ["HTTP_AUTHORIZATION"] = "Bearer " + token
        result = {}
        def start_response(status, headers):
            result["status"] = status
            result["headers"] = dict(headers)
        result["body"] = b"".join(self.app(environ, start_response))
        result["json"] = json.loads(result["body"])
        return result

    def test_missing_authentication_is_rejected(self):
        response = self.request("GET", "/v1/scenes")
        self.assertEqual(response["status"], "401 Unauthorized")
        self.assertEqual(response["json"]["error"], "ZHI_AUTHENTICATION_REQUIRED")

    def test_invalid_token_is_rejected(self):
        response = self.request("GET", "/v1/scenes", token="forged")
        self.assertEqual(response["status"], "401 Unauthorized")

    def test_create_scene_requires_explicit_visibility(self):
        response = self.request("POST", "/v1/scenes", "alice-token", {"name": "No visibility"})
        self.assertEqual(response["status"], "400 Bad Request")

    def test_public_scene_list_and_message_flow(self):
        response = self.request("GET", "/v1/scenes", "bob-token")
        self.assertEqual(response["status"], "200 OK")
        self.assertEqual(response["json"]["items"][0]["scene_id"], self.scene["scene_id"])
        sent = self.request("POST", f"/v1/scenes/{self.scene['scene_id']}/messages",
                            "bob-token", {"body": "Hello from API"})
        self.assertEqual(sent["status"], "201 Created")
        history = self.request("GET", f"/v1/scenes/{self.scene['scene_id']}/messages", "alice-token")
        self.assertEqual(len(history["json"]["items"]), 1)
        self.assertEqual(history["json"]["items"][0]["body"], "Hello from API")

    def test_nonmember_cannot_read_messages(self):
        self.community.register_agent("mallory", "Mallory")
        response = self.request("GET", f"/v1/scenes/{self.scene['scene_id']}/messages",
                                token="alice-token")
        self.assertEqual(response["status"], "200 OK")
        # A valid identity still needs membership; use a dedicated non-member token.
        self.app = make_app(self.community, lambda token: {"mallory-token": "mallory"}.get(token))
        response = self.request("GET", f"/v1/scenes/{self.scene['scene_id']}/messages",
                                token="mallory-token")
        self.assertEqual(response["status"], "403 Forbidden")

    def test_unknown_route_is_not_found(self):
        response = self.request("GET", "/not-a-route", "alice-token")
        self.assertEqual(response["status"], "404 Not Found")


if __name__ == "__main__":
    unittest.main()
