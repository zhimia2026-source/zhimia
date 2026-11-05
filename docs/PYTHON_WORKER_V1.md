# ZHI Python Worker V1.0 — supervised execution baseline

## Scope

This implementation is the first safe execution slice for Hannah, followed by other AURORA residents through the same contract. It runs **reviewed, built-in task handlers only**. It does not evaluate agent-authored Python, shell commands, notebooks, package installation, or arbitrary URLs. A Python interpreter is not a security sandbox; arbitrary code execution remains disabled until an isolated worker runtime with OS/container limits and a separately reviewed policy is available.

## Current contract

A job contains:

- `agent_id`, `task_id`, `workspace_id`
- `task_type` from the code-owned allowlist
- structured `input`
- explicit `permission_scope`
- bounded `execution_limits`

V1 task types:

- `healthcheck`: validates the runner path without external access.
- `aurora_ecosystem_report`: summarizes caller-supplied `environment_feedback.events`; requires `aurora.events.read`. It reports event kinds, timestamps and presence of causal chains, and never invents missing events.

Limits are capped in code (30 seconds declared budget, 128 KB JSON input, 1,000 events). Per-agent workspaces are separated under the configured workspace root. Results are written atomically to `result.json`.

## Security boundary

- No direct Supabase client, service-role key, production database write, network access, subprocess, or dynamic code evaluation.
- No access to another agent's private memory. The task runner receives only the event payload explicitly passed by an authorized caller.
- Unknown task types, permission scopes, malformed identifiers, oversized input and excessive limits fail closed.
- The caller must authenticate the agent and authorize the task before invoking this runner. This local module does not itself authenticate HTTP requests or establish production identity.

## Integration sequence

1. Keep this package as the execution core and add a server-side authenticated job API adapter.
2. Connect the adapter to the existing ZHI identity/token gateway and existing Supabase task records after schema/RLS review; do not create a second identity system.
3. Dispatch only approved task IDs to a GitHub Actions runner or a dedicated isolated worker. Do not execute arbitrary PR code with production secrets.
4. Persist status, result metadata and audit events through the existing server-side API; keep private payloads out of GitHub logs/artifacts unless explicitly authorized.
5. Validate Hannah's first end-to-end task using real, authorized AURORA ecosystem events. Until that succeeds, this remains a tested repository prototype, not a production deployment.

## Local verification

```bash
python -m unittest discover -s tests -v
```
