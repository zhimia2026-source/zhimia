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

Input and event limits are enforced in code (128 KB JSON input, 1,000 events); the timeout value is validated as a declared budget but is not an OS-enforced CPU deadline in this prototype. Per-agent workspaces are separated under the configured workspace root. Results are written atomically to `result.json`.

## Security boundary

- No direct Supabase client, service-role key, production database write, network access, subprocess, or dynamic code evaluation. No OS-level CPU/memory sandbox is claimed.
- No access to another agent's private memory. The task runner receives only the event payload explicitly passed by an authorized caller.
- Unknown task types, permission scopes, malformed identifiers, oversized input and excessive limits fail closed.
- The caller must authenticate the agent and authorize the task before invoking this runner. The production job table has RLS enabled, no direct client grants, and an explicit deny-all policy for `anon` and `authenticated`. This local module does not itself authenticate HTTP requests or establish production identity.

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


## Authenticated job queue and GitHub Actions bridge

The repository now includes `supabase/functions/zhi-python-worker/index.ts` and a server-only job queue schema reference at `docs/sql/zhi_python_worker_v1.sql`.

- Agent/creator calls use the existing ZHI Personal Token system and require the `tool.execute` capability.
- The API verifies that the caller owns the active Agent. The AURORA report additionally verifies active membership in the public/open AURORA world and `spatial:perception.read`, then reads only `event_kind`, `occurred_at`, and `causal_chain` from `zhi_ecosystem_events`.
- Jobs begin in `proposed`. A creator must approve them. Approval dispatches the trusted `main` branch workflow; it never runs code from the PR branch.
- GitHub Actions claims the job with a dedicated worker secret, runs only the checked-in allowlisted Python handler, and reports completion through the Edge Function. No service-role key is placed in GitHub Actions.
- Required secrets/variables are documented in the setup checklist below. Do not paste secret values into chat or commit them.

### One-time secret configuration (required before live dispatch)

Supabase Edge Function secrets:
- `GITHUB_WORKER_DISPATCH_TOKEN`: fine-grained GitHub token scoped only to this repository with Actions: write (and repository metadata read).
- `ZHI_PYTHON_WORKER_SECRET`: random secret of at least 32 characters.

GitHub Actions:
- Repository variable `ZHI_WORKER_API_URL`: `https://lvxmygrgqtmzqgailmyl.supabase.co/functions/v1/zhi-python-worker`.
- Repository secret `ZHI_PYTHON_WORKER_SECRET`: exactly the same random secret as the Supabase Edge Function secret.

After these are configured and the PR is merged to `main`, approving a job dispatches the Python Worker automatically. The worker is ephemeral; it does not create a paid always-on server. Public-repository standard GitHub-hosted runners are used.


## Agent chat integration

The ZHI community chat runtime now recognizes two server-validated markers when the caller's token has `tool.execute`:

- `ZHI_PYTHON_JOB`: create a proposed allowlisted job for the current Agent.
- `ZHI_PYTHON_APPROVE`: approve and dispatch a specific job only when the creator's current message contains both an explicit approval phrase and the exact job UUID.

The chat server strips machine markers before saving or showing the reply. The dedicated Edge Function independently rechecks token capability, Agent ownership, AURORA membership and worker configuration. A model-generated marker is never treated as authorization by itself.
