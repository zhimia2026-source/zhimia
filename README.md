# ZHI · First Agent (Manager)

本仓库实现 ZHI 世界第一阶段的本地 Python 原型：管理型智能人、私有 SQLite 记忆、任务审批、虚拟 ZHI 账本、审计日志和数据库备份/恢复。

## Requirements
- Python 3.10+
- No third-party dependencies (SQLite is included with Python)

## Run
```bash
python main.py init
python main.py status
python main.py task-add "整理森林资源" --detail "统计木材与花种库存"
python main.py plan 1
python main.py approve 1
python main.py execute 1
python main.py remember "完成首次资源盘点" --kind lesson
python main.py memories
python main.py audit
```

Database defaults to `./data/zhi.db`. Override with `ZHI_DB=/path/to/zhi.db`.
The database is local, but not automatically encrypted. Keep it out of public repositories and back it up securely.

## Supervised execution
Tasks begin as `proposed`. `plan` creates a deterministic proposed plan; `approve` is required before `execute`. Execution in this MVP only records a simulated result and does not run shell commands or access external systems.

## Private memory model
All memory and task records are scoped to the fixed agent ID `manager-001`. This is an application-level isolation boundary for the single-agent MVP, not a security boundary against a person with access to the local database file. Do not store secrets or sensitive personal data.

## Backup / restore
```bash
python main.py backup ./backups/zhi-backup.db
python main.py restore ./backups/zhi-backup.db
```
Restore replaces the current database file. Stop the application first and keep a separate backup before restoring.

## Tests
```bash
python -m unittest discover -s tests -v
```

## Stage 1 acceptance checklist
- [ ] Agent identity and fixed traits can be initialized and inspected.
- [ ] Tasks require approval before execution.
- [ ] Task outcomes and memory survive restarts.
- [ ] Each write creates an audit event.
- [ ] Database can be backed up and restored.
- [ ] Tests cover approval gating and persistence.

## Roadmap
1. Local deterministic core (this version).
2. Optional LLM adapter for plan proposals; validate all model output before execution.
3. Explicitly authorized agent-to-agent result exchange.
