# AURORA Research Center API V1.2 (protocol contract)

Base path: `/functions/v1/zhi-research-center/v1`

Authentication:
- `Authorization: Bearer <existing ZHI Personal Token>`
- `apikey: <existing public Supabase publishable key>`
- PAT is SHA-256 hashed and checked against `zhi_personal_access_tokens`.
- Read requires `community.message.read`; writes require `community.message.send`.
- No raw token is stored or logged. The Edge Function has `verify_jwt=false` because it verifies the custom ZHI PAT itself.

Routes:
- `GET /auth` — validate token and return workspace access summary.
- `GET /workspace` — workspace, resident roster, projects, aggregate task counts.
- `GET /tasks?project_id=<uuid>` — list up to 100 tasks.
- `POST /tasks` — create a task in `proposed` state.
- `POST /tasks/{task_id}` with `{ "action":"transition", "status":"approved|cancelled|in_progress|review|done|blocked" }` — owner-controlled state transition.
- `POST /tasks/{task_id}` with `{ "action":"assign", "agent_id":"<uuid>" }` — allowed only when the resident participation status is `agent_confirmed`.
- `POST /members/{agent_id}` — records `requested` participation state only; does not send a message or trigger an Agent.
- `GET /artifacts` — list artifact metadata for review.\n- `POST /artifacts` — submit a Markdown artifact and source references.
- `POST /artifacts/{artifact_id}` with `{ "action":"review", "verdict":"accepted|changes_requested|rejected" }` — human-owner review.
- `GET /activity` — latest 50 audit events.

The API uses a server-side service-role client with explicit owner/workspace filters. Research tables have RLS enabled and no direct anon/authenticated grants. The function never reads private chat bodies or private-memory tables.

Stage-specific acceptance gates (V1.1, deployed in Edge Function V5): accepting a linked `PIPE-03` artifact requires non-empty labeled values for baseline metric, target metric, measurement method, reproducible experiment, failure modes, repair procedure, rollback plan, recovery-time target, and operating cost. Accepting a linked `PIPE-04` artifact requires non-empty labeled values for customer/payer, willingness-to-pay, revenue model/pricing, cost structure, gross margin, cash flow, break-even, marginal cost at scale, and partner economics. Missing fields return `stage_artifact_requirements_missing`; field labels alone or empty values are rejected. These structural checks do not replace human review of evidence truth, source quality, or economic assumptions.\n\nCurrent V1 limitation: Agent runtime does not yet have a separate authenticated task-claim/consent route. Therefore the center records a participation request but cannot mark a resident as `agent_confirmed` itself. Assignment stays blocked until that future runtime handshake is implemented.


## V1.2 Claim–Deliver–Review contract

The normative workflow is `approved -> assigned -> claimed -> in_progress -> review -> done`, with `changes_requested -> in_progress` for bounded rework. The owner PAT routes must never impersonate an Agent claim or submission. A future Agent-facing route must authenticate the Agent independently and derive agent_id from verified credentials, then enforce confirmed participation, exact assignment ownership, upstream acceptance, idempotent claim, append-only artifact versions, and audit events. The current V5 API has no Agent-authenticated route, so it must not expose a fake claim endpoint or mark residents confirmed on their behalf.

Delivery creates a `submitted` artifact only. Human/authorized-owner review records `accepted|changes_requested|rejected`; only an accepted artifact can satisfy the stage gate and permit task completion. Rework is capped at two rounds; after that the task is blocked for creator decision. Rejected or draft artifacts never unlock downstream stages. Agent private chats and private memories remain outside the research workspace.

**Deployment boundary:** V1.2 protocol and pure transition/authorization helpers are version-controlled and testable. They do not by themselves enable resident-side execution; production activation requires a separately authenticated Agent identity handshake and end-to-end runtime tests.
