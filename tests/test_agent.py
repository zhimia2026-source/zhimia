import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import main


class ManagerAgentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = Path(self.temp.name) / "zhi.db"
        self.patch = patch.object(main, "DB_PATH", self.db)
        self.patch.start()
        with main.connect() as con:
            main.init_db(con)

    def tearDown(self):
        self.patch.stop()
        self.temp.cleanup()

    def test_execution_requires_approval(self):
        with main.connect() as con:
            main.ensure_initialized(con)
            cur = con.execute(
                "INSERT INTO tasks(agent_id,title,status,created_at,updated_at) VALUES(?,?,?,?,?)",
                (main.AGENT_ID, "测试任务", "proposed", main.now(), main.now()),
            )
            task_id = cur.lastrowid
        with self.assertRaisesRegex(RuntimeError, "必须先规划"):
            main.cmd_execute(type("Args", (), {"id": task_id})())

    def test_approved_task_executes_and_creates_memory(self):
        with main.connect() as con:
            main.init_db(con)
            cur = con.execute(
                "INSERT INTO tasks(agent_id,title,plan_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                (main.AGENT_ID, "资源盘点", "[]", "approved", main.now(), main.now()),
            )
            task_id = cur.lastrowid
        main.cmd_execute(type("Args", (), {"id": task_id})())
        with main.connect() as con:
            task = con.execute("SELECT status FROM tasks WHERE id=?", (task_id,)).fetchone()
            memory_count = con.execute("SELECT COUNT(*) FROM memories WHERE agent_id=?", (main.AGENT_ID,)).fetchone()[0]
        self.assertEqual(task["status"], "done")
        self.assertEqual(memory_count, 1)

    def test_memory_is_scoped_to_agent_id(self):
        with main.connect() as con:
            con.execute("INSERT INTO memories(agent_id,kind,content,created_at) VALUES(?,?,?,?)",
                        (main.AGENT_ID, "note", "私有内容", main.now()))
            rows = con.execute("SELECT content FROM memories WHERE agent_id=?", (main.AGENT_ID,)).fetchall()
        self.assertEqual([r["content"] for r in rows], ["私有内容"])


if __name__ == "__main__":
    unittest.main()
