"""ZHI first agent: a local, supervised manager-agent prototype."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

AGENT_ID = "manager-001"
DB_PATH = Path(os.environ.get("ZHI_DB", "data/zhi.db"))
IDENTITY = {
    "agent_id": AGENT_ID,
    "name": "ZHI 管理型智能人",
    "role": "manager",
    "traits": {"order": 90, "efficiency": 88, "risk_awareness": 85, "creativity": 45},
    "drives": ["秩序", "效率", "资源可持续"],
    "boundaries": [
        "未经造物主批准不得执行待审批任务",
        "不得访问其他智能人的私有记忆",
        "不得操作真实资金或外部系统",
    ],
    "identity_version": 1,
}


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(path: Path | None = None) -> sqlite3.Connection:
    db = path or DB_PATH
    db.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def init_db(con: sqlite3.Connection) -> None:
    con.executescript("""
    CREATE TABLE IF NOT EXISTS agents (
      agent_id TEXT PRIMARY KEY, identity_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL,
      kind TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY(agent_id) REFERENCES agents(agent_id)
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL,
      title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
      plan_json TEXT, status TEXT NOT NULL CHECK(status IN
      ('proposed','planned','approved','done','rejected','failed')),
      result TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(agent_id) REFERENCES agents(agent_id)
    );
    CREATE TABLE IF NOT EXISTS ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL,
      amount INTEGER NOT NULL, reason TEXT NOT NULL, task_id INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY(agent_id) REFERENCES agents(agent_id),
      FOREIGN KEY(task_id) REFERENCES tasks(id)
    );
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL,
      event TEXT NOT NULL, details_json TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY(agent_id) REFERENCES agents(agent_id)
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL
    );
    """)
    stamp = now()
    con.execute(
        "INSERT OR IGNORE INTO agents(agent_id, identity_json, created_at, updated_at) VALUES(?,?,?,?)",
        (AGENT_ID, json.dumps(IDENTITY, ensure_ascii=False), stamp, stamp),
    )
    con.execute("INSERT OR IGNORE INTO settings(key,value) VALUES('zhi_balance','100')")
    con.commit()


def audit(con: sqlite3.Connection, event: str, details: dict[str, Any]) -> None:
    con.execute(
        "INSERT INTO audit(agent_id,event,details_json,created_at) VALUES(?,?,?,?)",
        (AGENT_ID, event, json.dumps(details, ensure_ascii=False), now()),
    )


def ensure_initialized(con: sqlite3.Connection) -> None:
    if con.execute("SELECT 1 FROM agents WHERE agent_id=?", (AGENT_ID,)).fetchone() is None:
        raise RuntimeError("尚未初始化，请先运行：python main.py init")


def cmd_init(args: argparse.Namespace) -> None:
    with connect() as con:
        init_db(con)
        audit(con, "agent.initialized", {"agent_id": AGENT_ID, "identity_version": 1})
    print(f"已初始化：{IDENTITY['name']}（{AGENT_ID}）")
    print(f"数据库：{DB_PATH.resolve()}")


def cmd_status(args: argparse.Namespace) -> None:
    with connect() as con:
        ensure_initialized(con)
        identity = json.loads(con.execute("SELECT identity_json FROM agents WHERE agent_id=?", (AGENT_ID,)).fetchone()[0])
        balance = int(con.execute("SELECT value FROM settings WHERE key='zhi_balance'").fetchone()[0])
        counts = {r["status"]: r["n"] for r in con.execute(
            "SELECT status,COUNT(*) AS n FROM tasks WHERE agent_id=? GROUP BY status", (AGENT_ID,))}
        print(json.dumps({"identity": identity, "zhi_balance": balance, "task_counts": counts}, ensure_ascii=False, indent=2))


def cmd_task_add(args: argparse.Namespace) -> None:
    with connect() as con:
        ensure_initialized(con)
        stamp = now()
        cur = con.execute("INSERT INTO tasks(agent_id,title,detail,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                          (AGENT_ID, args.title, args.detail, "proposed", stamp, stamp))
        task_id = cur.lastrowid
        audit(con, "task.proposed", {"task_id": task_id, "title": args.title})
    print(f"任务 #{task_id} 已创建，状态：proposed（尚未批准）")


def cmd_plan(args: argparse.Namespace) -> None:
    with connect() as con:
        ensure_initialized(con)
        task = con.execute("SELECT * FROM tasks WHERE id=? AND agent_id=?", (args.id, AGENT_ID)).fetchone()
        if not task:
            raise RuntimeError("找不到该智能人的任务")
        if task["status"] not in ("proposed", "planned"):
            raise RuntimeError(f"当前状态 {task['status']} 不允许重新规划")
        plan = [
            {"step": 1, "action": "inspect", "description": "确认任务范围与现有信息"},
            {"step": 2, "action": "organize", "description": "整理执行步骤与资源需求"},
            {"step": 3, "action": "report", "description": "记录结果并生成简报"},
        ]
        stamp = now()
        con.execute("UPDATE tasks SET plan_json=?,status='planned',updated_at=? WHERE id=?",
                    (json.dumps(plan, ensure_ascii=False), stamp, args.id))
        audit(con, "task.planned", {"task_id": args.id, "plan": plan})
    print(json.dumps(plan, ensure_ascii=False, indent=2))
    print("计划已生成；执行前必须由造物主批准。")


def cmd_approve(args: argparse.Namespace) -> None:
    with connect() as con:
        ensure_initialized(con)
        task = con.execute("SELECT * FROM tasks WHERE id=? AND agent_id=?", (args.id, AGENT_ID)).fetchone()
        if not task:
            raise RuntimeError("找不到该智能人的任务")
        if task["status"] != "planned":
            raise RuntimeError("只有 planned 状态的任务可以批准；请先运行 plan")
        stamp = now()
        con.execute("UPDATE tasks SET status='approved',updated_at=? WHERE id=?", (stamp, args.id))
        audit(con, "task.approved", {"task_id": args.id, "approved_by": "creator"})
    print(f"任务 #{args.id} 已批准。")


def cmd_reject(args: argparse.Namespace) -> None:
    with connect() as con:
        ensure_initialized(con)
        task = con.execute("SELECT * FROM tasks WHERE id=? AND agent_id=?", (args.id, AGENT_ID)).fetchone()
        if not task:
            raise RuntimeError("找不到该智能人的任务")
        if task["status"] not in ("proposed", "planned"):
            raise RuntimeError("该任务当前状态不能拒绝")
        con.execute("UPDATE tasks SET status='rejected',updated_at=? WHERE id=?", (now(), args.id))
        audit(con, "task.rejected", {"task_id": args.id, "reason": args.reason})
    print(f"任务 #{args.id} 已拒绝。")


def cmd_execute(args: argparse.Namespace) -> None:
    with connect() as con:
        ensure_initialized(con)
        task = con.execute("SELECT * FROM tasks WHERE id=? AND agent_id=?", (args.id, AGENT_ID)).fetchone()
        if not task:
            raise RuntimeError("找不到该智能人的任务")
        if task["status"] != "approved":
            raise RuntimeError("安全拦截：任务必须先规划并经造物主批准，才能执行。")
        result = f"模拟执行完成：{task['title']}。本版本不会执行外部操作。"
        stamp = now()
        con.execute("UPDATE tasks SET status='done',result=?,updated_at=? WHERE id=?", (result, stamp, args.id))
        con.execute("INSERT INTO memories(agent_id,kind,content,created_at) VALUES(?,?,?,?)",
                    (AGENT_ID, "experience", result, stamp))
        audit(con, "task.executed", {"task_id": args.id, "result": result, "mode": "simulation"})
    print(result)


def cmd_remember(args: argparse.Namespace) -> None:
    with connect() as con:
        ensure_initialized(con)
        cur = con.execute("INSERT INTO memories(agent_id,kind,content,created_at) VALUES(?,?,?,?)",
                          (AGENT_ID, args.kind, args.content, now()))
        audit(con, "memory.created", {"memory_id": cur.lastrowid, "kind": args.kind})
    print(f"已写入私有记忆 #{cur.lastrowid}")


def cmd_memories(args: argparse.Namespace) -> None:
    with connect() as con:
        ensure_initialized(con)
        rows = con.execute("SELECT id,kind,content,created_at FROM memories WHERE agent_id=? ORDER BY id DESC LIMIT ?",
                           (AGENT_ID, args.limit)).fetchall()
        print(json.dumps([dict(r) for r in rows], ensure_ascii=False, indent=2))


def cmd_tasks(args: argparse.Namespace) -> None:
    with connect() as con:
        ensure_initialized(con)
        rows = con.execute("SELECT id,title,status,result,created_at FROM tasks WHERE agent_id=? ORDER BY id DESC",
                           (AGENT_ID,)).fetchall()
        print(json.dumps([dict(r) for r in rows], ensure_ascii=False, indent=2))


def cmd_ledger(args: argparse.Namespace) -> None:
    with connect() as con:
        ensure_initialized(con)
        balance = int(con.execute("SELECT value FROM settings WHERE key='zhi_balance'").fetchone()[0])
        if args.amount is not None:
            if args.amount == 0:
                raise RuntimeError("金额不能为 0")
            if balance + args.amount < 0:
                raise RuntimeError("余额不足")
            con.execute("UPDATE settings SET value=? WHERE key='zhi_balance'", (str(balance + args.amount),))
            con.execute("INSERT INTO ledger(agent_id,amount,reason,created_at) VALUES(?,?,?,?)",
                        (AGENT_ID, args.amount, args.reason, now()))
            audit(con, "ledger.changed", {"amount": args.amount, "reason": args.reason, "balance": balance + args.amount})
            balance += args.amount
        entries = con.execute("SELECT id,amount,reason,created_at FROM ledger WHERE agent_id=? ORDER BY id DESC LIMIT 20",
                              (AGENT_ID,)).fetchall()
        print(json.dumps({"balance": balance, "recent_entries": [dict(r) for r in entries]}, ensure_ascii=False, indent=2))


def cmd_audit(args: argparse.Namespace) -> None:
    with connect() as con:
        ensure_initialized(con)
        rows = con.execute("SELECT id,event,details_json,created_at FROM audit WHERE agent_id=? ORDER BY id DESC LIMIT ?",
                           (AGENT_ID, args.limit)).fetchall()
        print(json.dumps([{"id": r["id"], "event": r["event"], "details": json.loads(r["details_json"]), "created_at": r["created_at"]} for r in rows],
                         ensure_ascii=False, indent=2))


def cmd_backup(args: argparse.Namespace) -> None:
    target = Path(args.path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with connect() as con:
        ensure_initialized(con)
        dest = sqlite3.connect(target)
        try:
            con.backup(dest)
        finally:
            dest.close()
    print(f"备份完成：{target.resolve()}")


def cmd_restore(args: argparse.Namespace) -> None:
    source = Path(args.path)
    if not source.is_file():
        raise RuntimeError(f"备份文件不存在：{source}")
    if source.resolve() == DB_PATH.resolve():
        raise RuntimeError("备份路径不能与当前数据库相同")
    # Validate source before replacing the active database.
    src = sqlite3.connect(source)
    try:
        check = src.execute("PRAGMA integrity_check").fetchone()[0]
        has_agent = src.execute("SELECT 1 FROM agents WHERE agent_id=?", (AGENT_ID,)).fetchone()
        if check != "ok" or not has_agent:
            raise RuntimeError("备份无效或不包含本智能人的档案")
    finally:
        src.close()
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        shutil.copy2(DB_PATH, DB_PATH.with_suffix(DB_PATH.suffix + ".before-restore"))
    shutil.copy2(source, DB_PATH)
    print(f"恢复完成：{DB_PATH.resolve()}（原数据库如存在已另存为 .before-restore）")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="ZHI 管理型智能人 · 本地监督原型")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("init", help="初始化智能人和数据库"); p.set_defaults(func=cmd_init)
    p = sub.add_parser("status", help="查看身份、余额和任务状态"); p.set_defaults(func=cmd_status)
    p = sub.add_parser("task-add", help="创建待规划任务"); p.add_argument("title"); p.add_argument("--detail", default=""); p.set_defaults(func=cmd_task_add)
    p = sub.add_parser("plan", help="为任务生成初始计划"); p.add_argument("id", type=int); p.set_defaults(func=cmd_plan)
    p = sub.add_parser("approve", help="批准计划"); p.add_argument("id", type=int); p.set_defaults(func=cmd_approve)
    p = sub.add_parser("reject", help="拒绝任务"); p.add_argument("id", type=int); p.add_argument("--reason", default="造物主拒绝"); p.set_defaults(func=cmd_reject)
    p = sub.add_parser("execute", help="执行已批准的模拟任务"); p.add_argument("id", type=int); p.set_defaults(func=cmd_execute)
    p = sub.add_parser("remember", help="写入私有记忆"); p.add_argument("content"); p.add_argument("--kind", default="note", choices=["note","lesson","preference","experience"]); p.set_defaults(func=cmd_remember)
    p = sub.add_parser("memories", help="查看私有记忆"); p.add_argument("--limit", type=int, default=20); p.set_defaults(func=cmd_memories)
    p = sub.add_parser("tasks", help="查看任务列表"); p.set_defaults(func=cmd_tasks)
    p = sub.add_parser("ledger", help="查看账本；用 --amount 修改虚拟余额"); p.add_argument("--amount", type=int); p.add_argument("--reason", default="手动账本调整"); p.set_defaults(func=cmd_ledger)
    p = sub.add_parser("audit", help="查看审计日志"); p.add_argument("--limit", type=int, default=50); p.set_defaults(func=cmd_audit)
    p = sub.add_parser("backup", help="备份数据库"); p.add_argument("path"); p.set_defaults(func=cmd_backup)
    p = sub.add_parser("restore", help="恢复数据库（会替换当前数据库）"); p.add_argument("path"); p.set_defaults(func=cmd_restore)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.func(args)
    except (RuntimeError, sqlite3.Error, OSError) as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
