import json
import tempfile
import unittest
from pathlib import Path

from python_worker.contracts import JobRequest, JobValidationError
from python_worker.runner import run_job


class PythonWorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def base_job(self, **updates):
        job = {
            "agent_id": "hannah",
            "task_id": "task-001",
            "workspace_id": "workspace-a",
            "task_type": "healthcheck",
            "input": {},
            "permission_scope": [],
        }
        job.update(updates)
        return job

    def test_healthcheck_writes_result_in_agent_workspace(self):
        result = run_job(self.base_job(), self.root)
        path = self.root / "hannah" / "workspace-a" / "result.json"
        self.assertTrue(path.is_file())
        saved = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(saved, result)
        self.assertEqual(result["result"]["status"], "ok")

    def test_agents_receive_separate_workspaces(self):
        run_job(self.base_job(), self.root)
        run_job(self.base_job(agent_id="alice", workspace_id="workspace-a"), self.root)
        self.assertTrue((self.root / "hannah" / "workspace-a").is_dir())
        self.assertTrue((self.root / "alice" / "workspace-a").is_dir())

    def test_ecosystem_report_requires_read_scope_and_summarizes_causality(self):
        raw = self.base_job(
            task_type="aurora_ecosystem_report",
            permission_scope=["aurora.events.read"],
            input={"events": [
                {"event_kind": "rainfall", "occurred_at": "2026-11-05T01:00:00Z", "causal_chain": ["weather"]},
                {"event_kind": "plant_growth", "occurred_at": "2026-11-05T02:00:00Z", "causal_chain": []},
            ]},
        )
        result = run_job(raw, self.root)["result"]
        self.assertEqual(result["event_count"], 2)
        self.assertEqual(result["event_kinds"], {"plant_growth": 1, "rainfall": 1})
        self.assertEqual(result["events_with_causal_chain"], 1)

    def test_ecosystem_report_without_scope_is_rejected(self):
        raw = self.base_job(task_type="aurora_ecosystem_report")
        with self.assertRaisesRegex(JobValidationError, "required_permission_missing"):
            JobRequest.parse(raw)

    def test_arbitrary_task_type_is_rejected(self):
        with self.assertRaisesRegex(JobValidationError, "task_type_not_allowlisted"):
            JobRequest.parse(self.base_job(task_type="run_python"))

    def test_unknown_permissions_are_rejected(self):
        with self.assertRaisesRegex(JobValidationError, "permission_scope_not_allowlisted"):
            JobRequest.parse(self.base_job(permission_scope=["database.write"]))

    def test_limits_cannot_be_raised_by_agent(self):
        raw = self.base_job(execution_limits={"timeout_seconds": 999})
        with self.assertRaisesRegex(JobValidationError, "invalid_execution_limit"):
            JobRequest.parse(raw)

    def test_event_count_is_bounded(self):
        raw = self.base_job(
            task_type="aurora_ecosystem_report",
            permission_scope=["aurora.events.read"],
            input={"events": [{"event_kind": "x"}] * 1001},
        )
        with self.assertRaisesRegex(JobValidationError, "input_too_large|event_limit_exceeded"):
            run_job(raw, self.root)

    def test_workspace_identifier_rejects_path_traversal(self):
        with self.assertRaisesRegex(JobValidationError, "invalid_workspace_id"):
            JobRequest.parse(self.base_job(workspace_id="../outside"))


if __name__ == "__main__":
    unittest.main()
