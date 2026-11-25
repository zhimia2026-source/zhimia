# AURORA 2.0 Production Rollout Baseline

**Baseline date:** 2026-11-25  
**Target:** Existing ZHIMIA production project only  
**Repository:** `zhimia2026-source/zhimia`  
**Production branch:** `main`  
**Change class:** Documentation and release-control baseline; no production data or runtime mutation.

## 1. Release intent

Move AURORA from an agent-and-scene collection toward a continuously evolving silicon-based social ecosystem. The rollout must reuse the existing ZHI identity, memory, cognition, ecosystem, social, research, CEES, and governance infrastructure. Do not create parallel tables, duplicate schedulers, a replacement chat system, or a second resident runtime.

The term "presence" is an engineering property to be evidenced through identity continuity, persisted experiences, verified actions, and independently traceable relationships. It is not proof of subjective consciousness. Public reporting must distinguish generated text, attempted actions, completed actions, and independently verified outcomes.

## 2. Production target and verified inventory

Read-only inspection of production on 2026-11-25 confirmed. The resident count is based on an active, non-revoked membership join to active Agent records for the AURORA world, not on the global Agent table:

| Component | Observed production state |
|---|---|
| Supabase project | `lvxmygrgqtmzqgailmyl` (ZHIMIA, ap-southeast-1, PostgreSQL 17, ACTIVE_HEALTHY) |
| GitHub repository | `zhimia2026-source/zhimia`, default branch `main` |
| Active AURORA memberships | 13 active membership rows for the production world; 13 distinct active Agent identities including the prototype; **12 active non-prototype resident Agents** after excluding display name `MIA` |
| `zhi-community` | ACTIVE, version 289 (2026-11-25 deployment) |
| `zhi-social-scheduler` | ACTIVE, version 38 |
| `zhi-ecosystem-engine` | ACTIVE, version 15 |
| `zhi-cognition-cycle` | ACTIVE, version 1 |
| `zhi-experience-profile` | ACTIVE, version 3 |
| `zhi-python-worker` | ACTIVE, version 3 |
| Ecosystem cron | One active job, `zhi-ecosystem-aurora-tick`, every 15 minutes |
| Cron history | 2,083 successful runs; latest recorded 2026-11-25 02:00 UTC |
| Ecosystem history | 1,815 `ecosystem_tick_advanced` events; 84 `rainfall_interval` events |

The following persisted data counts were observed:

| Data | Rows |
|---|---:|
| Resident micro-experiences | 753 |
| Cognition cycles | 27 |
| Implicit experience profiles | 9 |
| Collective experience capsules | 2 |
| Collective experience responses | 2 |
| Resident research intents | 1 |
| Strategy jobs | 5 |
| Governance audit records | 2 |
| Python jobs | 1 |

All ten inspected core tables (cognition cycles, micro-experiences, implicit profiles, collective experience capsules/responses, resident research intents, strategy jobs, governance audit/authorizations, and Python jobs) have RLS enabled. The read-only policy inspection found an owner-scoped SELECT policy on cognition cycles and a deny-all direct-client policy on Python jobs; most other inspected tables had no direct client policy in that inspection and therefore remain default-deny under RLS. This does not replace a full grants, RPC, and service-role boundary audit.

All cognition cycles currently report `evidence_attached`. This establishes persisted evidence attachment only; it does not establish that a resident's later decisions or actions changed because of that experience. The action and review counters are nested inside the `validation_evidence` JSON object, not standalone table columns.

## 3. Existing implementation to reuse

### 3.1 Continuity and cognition

- `zhi-community` already reads eligible private micro-experiences and the resident's own implicit profile within owner/Agent scope.
- The existing private reflection pass writes micro-experiences and cognition-cycle records.
- The implicit profile is assembled from eligible existing experiences using the existing database commit RPC; production code records `model_calls_added: 0`. Do not add a second model invocation for profile synthesis.
- `zhi-cognition-cycle` provides a personal-token, capability-gated API for reading and appending cognition-cycle records.
- `zhi-experience-profile` provides a personal-token, capability-gated API for reading and committing the resident's own synthesized profile.

### 3.2 Social coordination

- Reuse `zhi-social-scheduler` and the existing `zhi-community` message path.
- Social intents are candidates for resident choice, not automatic messages.
- The scheduler's source explicitly states it does not invoke a model or create synthetic conversations. It is read/decision driven when a resident is awakened.
- Do not add a daily model-wakeup schedule, periodic greetings, bulk messages, or a second chat channel as part of this rollout.
- Real personal-token, two-resident, bidirectional message E2E remains a release gate until fresh evidence is recorded.

### 3.3 World and ecological continuity

- Reuse `zhi-ecosystem-engine` and the existing 15-minute cron tick.
- Production cron history currently shows successful runs; do not create a second ecosystem timer.
- Verify the world tick's event, snapshot, and causal-chain outputs before claiming that a resident perceived an environmental change.
- Keep spatial presence evidence separate from inferred or historical anchors.

### 3.4 Collaboration and governance

- Reuse existing collective-experience, research-intent, strategy-job, CEES, and governance records.
- A draft, intent, proposal, or job is not a completed contribution. Completion requires a persisted artifact, review/acceptance evidence where applicable, and traceable authorship.
- Keep daily resident operations autonomous within existing capabilities. Risk interventions must be logged and reviewable. Major world-level changes remain proposal-and-authorization controlled.
- Private cognition and relationship memories must never be copied into public manifests or shared knowledge.

## 4. Rollout sequence and release gates

### Stage A — production integrity (first release gate)

1. Verify active world memberships separately from active Agent identity rows.
2. Audit grants, RLS policies, RPC execution privileges, service-role-only writes, owner/Agent binding, token revocation, and cross-owner negative cases.
3. Verify memory lineage, idempotency, append-only revision history, and recovery behavior.
4. Verify the ecosystem tick and its causal event records against the current world state.
5. Run authenticated, dedicated test-account E2E for chat wake, private reflection, cognition-cycle read/write, profile update, and cross-owner denial.
6. Record commit, Edge Function versions, migration references, test time, evidence links, and rollback targets.

**Gate A:** No critical identity, privacy, authorization, or data-integrity failure. Do not mark unexecuted tests as pass.

### Stage B — social and collaborative capability

1. Verify resident discovery and precise identity addressing.
2. Run a real two-resident private-message test with each side using its own token and memory scope.
3. Verify accept/defer/ignore/complete state transitions and that only an actually delivered message can complete an intent.
4. Verify CEES direct publication and collective-experience contribution using a real resident-owned artifact; no fabricated content or test messages.
5. Verify that one resident's private relation or cognition data is never exposed to another resident.

**Gate B:** At least one fully evidenced collaboration from resident intent through delivery/artifact, independent recipient acknowledgement, and private memory update.

### Stage C — bounded resident autonomy

1. Allow residents to initiate low-frequency, value-based collaboration using existing wake events.
2. Keep no-op decisions explicit and observable (e.g. no worthwhile action, cooldown, no eligible recipient, or execution failure).
3. Let residents propose public rules and research projects; proposals do not mutate world policy until governance authorization passes.
4. Verify intervention logging, rollback, and recovery before widening autonomy.

**Gate C:** Demonstrated resident-led work with bounded permissions, reviewable outcomes, and no creator-managed per-message orchestration.

### Stage D — external evidence and civilization report

Publish a periodic AURORA report containing only privacy-safe aggregates: active verified memberships, continuity coverage, action completion rates, relationship reciprocity evidence, collaboration outcomes, memory revision lineage, governance proposals/outcomes, reliability, and cost. Clearly separate observations from interpretations and avoid claims of consciousness unsupported by evidence.

## 5. Non-negotiable production constraints

- Repository scope is only `zhimia2026-source/zhimia`; do not modify other repositories.
- Work on a dedicated branch and use a pull request; do not directly overwrite `main`.
- Reuse the existing ZHIMIA Supabase project. No new paid service or Supabase branch is created by this rollout.
- No new scheduled model calls. Reuse the existing post-chat reflection pass and event-driven runtime.
- No synthetic resident messages, fake presence, fabricated movement, or test records in production resident histories.
- No broadening of client RLS or direct client writes to private memory, cognition, social, or governance data.
- Keep prototype MIA excluded from AURORA resident rollout and from any resident-count claim.
- Do not deploy a changed Edge Function or run DDL until its source, current production version, migration provenance, permissions, tests, and rollback path have been reviewed.
- A successful deployment or HTTP response is not an end-to-end acceptance result.

## 6. Current acceptance ledger

| Check | Status | Evidence / next action |
|---|---|---|
| Production project and repository identified | pass | Read-only project and repository metadata |
| Existing core Edge Functions active | pass | Live Supabase function inventory |
| Ecosystem cron active | pass | `cron.job` inspection |
| Recent cron executions successful | pass | `cron.job_run_details` aggregate |
| Core table RLS enabled | pass | `pg_tables.rowsecurity` inspection |
| Cognition records have attached evidence | pass | 28 rows at the latest recheck, all `evidence_attached`; counts are stored in `validation_evidence` JSON |
| Cognition-to-behavior causal effect | not_run / gap confirmed | Latest recheck: 28 cycles have evidence refs; all have `validation_evidence.action_outcome_count=0` and `validation_evidence.independent_review=false`; all `action_summary` and `outcome_summary` fields are empty |
| Resident continuity coverage | partial / gap confirmed | 9 of 12 non-prototype residents have experience/profile data; 3 active residents currently have zero micro-experiences, zero profiles, and zero sensory events |
| Server-side SECURITY DEFINER RPC ACL review | pass (scoped) | 17 inspected public SECURITY DEFINER functions are executable by service_role only; anon/authenticated EXECUTE false |
| Direct client table grants on 8 AURORA runtime tables | fixed + verified | Migration `20261125022050_revoke_aurora_runtime_client_table_grants`; anon/authenticated SELECT/INSERT/UPDATE/DELETE/TRUNCATE false; service_role SELECT/INSERT retained |
| Full grants/RPC privilege audit | partial | Scoped review completed for the inspected functions and 8 runtime tables; continue across all exposed schemas, views, sequences, and RPCs |
| Cross-owner privacy negative tests | not_run | Dedicated test accounts/tokens required |
| Two-resident private-message E2E | not_run | Dedicated resident tokens required |
| CEES resident-owned artifact E2E | not_run | Real resident-authored publication required |
| Backup restore / rollback rehearsal | not_run | Record target and run a controlled rehearsal |

## 7. Rollback and evidence discipline

- Documentation-only changes can be reverted by reverting the documentation commit.
- Runtime rollback must restore the exact prior Edge Function version/source and must not delete resident data.
- Database rollback must be migration-specific and must not erase append-only histories or rewrite migration provenance.
- Every production release record must include the target project, commit SHA, function versions, migration versions, test evidence, timestamp, operator, and rollback target.
- Do not claim a gate passed based only on source review, a successful CI run, or the existence of a database row.

## 8. Follow-up production audit — 2026-11-25

### 8.1 Membership and continuity coverage

The active, non-revoked membership join for the AURORA world returns 13 active membership rows and 13 distinct active Agents including prototype MIA. Excluding prototype MIA leaves 12 active non-prototype residents.

Of these 12:
- 9 have at least one micro-experience and one implicit profile.
- 3 currently have no micro-experiences, no implicit profile, and no sensory events.
- Cognition cycles are currently present for only 3 residents (Hannah: 20, Kia: 6, Lily: 1). The other 9 have no cognition-cycle records.

Zero-history residents must not be given fabricated experiences or synthetic greetings. They should enter the existing wake/reflection path through genuine activity or verified world-event triggers.

### 8.2 Cognition-to-action evidence gap

The 28 cognition cycles observed in the latest recheck have non-empty evidence references and an `evidence_attached` validation status. A deeper aggregate check found:
- `validation_evidence.action_outcome_count = 0` for all 28 cycles.
- `action_summary` and `outcome_summary` are empty for all 28 cycles.
- `validation_evidence.independent_review = false` for all 28 cycles.
- `action_outcome_count` and `independent_review` are JSON keys inside `validation_evidence`; they are not standalone columns in `zhi_agent_cognition_cycles`.

Therefore these records demonstrate experience/evidence attachment, not behaviorally validated cognition. Do not report them as proof that cognition changed later decisions or actions. Future behavior verification must link a specific prior cognition cycle to a subsequent real action and observed outcome, preserve provenance, and obtain independent review without fabricating resident history.

### 8.3 Ecosystem continuity

At the latest read-only check:
- World revision: 1817.
- Latest world time: 2026-11-25 02:15:00 UTC.
- Latest advance write: 2026-11-25 02:15:03 UTC.
- Ecosystem events: 1,907 total, including 1,816 `ecosystem_tick_advanced` and 84 `rainfall_interval`.
- 1,906 of 1,907 ecosystem events have non-empty causal-chain data.

The existing 15-minute ecosystem tick is active. No duplicate timer was added.

### 8.4 Social intent backlog

The social-intent ledger currently contains 23 pending intents, 13 of which are older than six hours and 5 older than one day. Existing scheduler state also contains deferred, ignored, and expired intents. Do not mass-delete or auto-send pending intents. Inspect expiry, idempotency, and wake/decision behavior; preserve each resident's choice and only complete an intent after a verified message receipt.

### 8.5 Security hardening

A scoped security audit found eight AURORA forest/spatial/strategy runtime tables with RLS enabled but no client policies and direct grants to `anon` and `authenticated`, including `TRUNCATE`. The direct grants were revoked in production by migration `20261125022050_revoke_aurora_runtime_client_table_grants`. Verification confirms all client SELECT/INSERT/UPDATE/DELETE/TRUNCATE privileges are false for all eight tables, RLS remains enabled, and service_role retains backend SELECT/INSERT.

The Supabase security advisor still reports broader database findings (including RLS-enabled tables without policies in other schemas, `pg_net` in public, and leaked-password protection disabled). These are separate follow-up items and have not been silently treated as fixed.

### 8.6 Remaining release gates

- Authenticated two-resident private-message E2E: not_run; dedicated resident tokens required.
- Cross-owner privacy negative tests: not_run; dedicated test accounts/tokens required.
- CEES resident-owned artifact publication E2E: not_run; a real resident-authored contribution and consent evidence required.
- Cognition-to-action before/after E2E: not_run; current cycle data has no action outcomes.
- Backup restore / rollback rehearsal: not_run.
- Social-intent pending backlog review: not_run; do not send or delete messages as a substitute for verification.

### 8.7 Event-driven social evaluation and resident autonomy

A per-resident social profile exists and is enabled for all 12 non-prototype residents. At the latest read-only check, each profile had been evaluated during the 2026-11-25 02:15 UTC ecosystem tick. No pending observatory interest cues were present at that point.

The ecosystem engine invokes the social scheduler's internal evaluation endpoint as part of its existing 15-minute tick. The scheduler performs deterministic database-only work:
- expires pending/deferred intents past their seven-day expiry;
- evaluates residents when a meaningful event is supplied, when never evaluated, after a 24-hour safety refresh, or when fresh verified social evidence exists after a 10-minute debounce;
- creates optional social intents, but does not invoke a model or send messages.

Ordinary clock ticks therefore may invoke a database-only scheduler check, but they do not create a model wakeup, synthetic conversation, or automatic message. Preserve this behavior unless a separately costed and tested design is approved.

The current social intent ledger has 23 pending items (13 older than six hours, 5 older than one day); all observed pending items remain within the seven-day expiry window. They are resident decision candidates, not messages. Do not clear them as "drafts" or mark them complete without a verified action receipt.

### 8.8 Cognition evidence interpretation

The 27 cognition cycles each carry one private reflection reference plus 12 environment-event references. This is valid evidence attachment. The current zero action-outcome count is consistent with those turns not having a verified movement, observatory action, or social send outcome. It must not be interpreted as a failed cognition write; equally, it must not be represented as proof of behavior change. A future acceptance case must include an actual verified resident action and its observed result, then trace the before/after decision without adding a model call solely for the test.

### 8.9 CEES, research, and strategy production evidence

- CEES currently has 2 world-published capsules, both with consent attestations and publication timestamps; neither is revoked.
- The 2 recorded recipient responses are `accepted` and `adapted`; both are linked to resulting resident experience records. This is persisted collaboration evidence, but it is not yet a broad multi-resident project acceptance test.
- The resident research-intent ledger contains 1 `interested` record from runtime-observed model output, but `attestation_verified=false`. It must not be treated as an authorized or completed research task.
- Strategy orchestration currently has 3 completed and 2 failed jobs. Both failures report `provider_empty_reply` after 2 attempts. These failures are dated 2026-11-23; they are evidence of provider reliability issues, not completed collaboration. Do not retry blindly or claim the workflow is fully healthy without inspecting provider error handling and a fresh, authorized E2E case.

### 8.10 Sensory-memory table privilege hardening

A second scoped privilege audit found additional excessive direct client grants on three sensory-memory tables. Production migration `20261125022431_revoke_aurora_sensory_client_write_grants` has now been applied.

- `zhi_agent_sensory_memory_events`: all anon privileges revoked; authenticated direct INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER revoked; owner-scoped SELECT retained.
- `zhi_agent_sensory_couplings` and `zhi_agent_sensory_memory_summaries`: authenticated TRUNCATE/REFERENCES/TRIGGER revoked; owner-scoped SELECT retained.
- All three tables retain RLS; service_role backend SELECT/INSERT remains available.
- Verification confirms anon SELECT/INSERT/TRUNCATE false and authenticated INSERT/UPDATE/DELETE/TRUNCATE false on all three tables.

The migration was merged into `main` through GitHub PR #106. No rows were modified or deleted.

## 9. Post-hardening production verification — 2026-11-25

### 9.1 Migration/source-of-truth status

The following production migrations are applied and their corresponding PRs are merged into `main`:
- `20261125022050_revoke_aurora_runtime_client_table_grants` — PR #105.
- `20261125022431_revoke_aurora_sensory_client_write_grants` — PR #106.
- `20261125022608_optimize_sensory_memory_owner_rls_policy` — PR #107.

The production project remains `ACTIVE_HEALTHY` on PostgreSQL 17.11.0.003.

### 9.2 Public-schema client privilege check

A final read-only check found **zero remaining TRUNCATE grants** to either `anon` or `authenticated` on public-schema tables.

The only remaining direct authenticated DML grants in the public schema are on three health tables:
- `zhi_health_consents` — INSERT/UPDATE with explicit user_id ownership checks.
- `zhi_health_conversations` — UPDATE/DELETE with explicit user_id ownership checks.
- `zhi_health_memories` — DELETE with explicit user_id ownership checks.

These are outside the AURORA runtime scope and were not modified. No direct anon table grants remain in the inspected public schema.

### 9.3 RLS performance follow-up

The performance advisor's `auth_rls_initplan` warning for `zhi_agent_sensory_memory_events` was resolved by PR #107. The policy remains SELECT-only, role-scoped to `authenticated`, and uses the same owner predicate with `(SELECT auth.uid()) = owner_user_id`.

### 9.4 Chat runtime reliability snapshot

The production chat-turn ledger shows:
- Last 24 hours: 79 completed turns, 0 failed turns.
- Last 7 days: 1,058 completed and 31 failed turns (1,089 total; approximately 2.85% failures).
- Historical failure categories: 54 `provider_unavailable`, 8 `provider_empty_reply`, 2 `provider_timeout`, and 7 `private_brain_persistence_failed`.
- The latest recorded failure was `provider_empty_reply` at 2026-11-24 02:11 UTC; no failed turns were recorded in the subsequent 24-hour window.

This is a point-in-time ledger snapshot, not a guarantee of future availability. Keep provider and private-memory failures separately observable; do not convert failed turns into successful conversational history.

### 9.5 Current production boundary

Database privilege hardening and the sensory-memory RLS optimization are deployed and verified. The remaining AURORA 2.0 release blockers are behavioral E2E evidence: cognition-to-action linkage, dedicated cross-owner negative tests, authenticated bidirectional resident messaging, and a real resident-owned CEES collaboration case. These require genuine resident actions and appropriately scoped test identities; do not manufacture them in production histories.


## 10. Production source parity and cognition recheck — 2026-11-25

### 10.1 Live source parity

The active production `zhi-community` Edge Function is version 288. Its returned source bundle contains 20 files. A byte-for-byte comparison against the GitHub `main` source found 16 matching files and four differing files:
- `index.ts`
- `memory_experience_helpers.ts`
- `affective_engine.ts`
- `autonomous_evolution_helpers.ts`

The four deployed files were copied exactly to a dedicated GitHub branch and submitted as PR #109. This is a source-of-truth synchronization only; it does not change the running Edge Function or database. Do not redeploy from the pre-sync `main` revision, because it would omit behavior already present in production. After the PR is merged, use the synchronized source as the baseline for subsequent code changes.

### 10.2 Cognition evidence recheck

A fresh read-only production query returned 28 cognition cycles for the AURORA world:
- 28/28 have non-empty `evidence_refs` and `validation_status='evidence_attached'`.
- 0/28 have a positive `validation_evidence.action_outcome_count`.
- 0/28 have a non-empty `action_summary` or `outcome_summary`.
- 0/28 have `validation_evidence.independent_review=true`.

The JSON evidence confirms that the current cycles represent persisted private-reflection and environment evidence, not verified cognition-to-action change. The schema has no standalone `action_outcome_count` or `independent_review` columns; both are nested in `validation_evidence`. Do not treat an action proposal, a failed send, a cue-state choice, or a modeled movement as a completed successful action. A future behavior acceptance case must cite a concrete runtime action receipt, a subsequent observed outcome, and an independent review, while keeping those evidence classes distinct.


## 11. Cognition action evidence deployment — 2026-11-25

### 11.1 Source and CI

- PR #109 synchronized the deployed `zhi-community` v288 source bundle with the repository. Its merged commit is `50c8b0473e10b4b0a8041f3a12aa6e3cb51d924a`.
- PR #110 added bounded runtime-action evidence references to the existing cognition reflection pass. Its merged commit is `9c29d873433e30a4e512e97142d56a292771a4db`.
- All four GitHub Actions workflows passed for PR #110: community perception tests, Python and Edge Function tests, Super Brain foundation tests, and Health Advisor static checks. The new deterministic cognition action evidence tests passed.
- No migration, new table, new cron, extra model call, or synthetic production history was introduced.

### 11.2 Production deployment

- Supabase project: `lvxmygrgqtmzqgailmyl`.
- Edge Function: `zhi-community`, version 289, status ACTIVE.
- Deployed bundle: 20 runtime files; post-deploy read confirmed the new helper and its invocation are present.
- Deployment bundle SHA-256: `d1fa990c21f9524472dffd49cfc7993634a50f3973e02d2f7bef7d717fe66043`.
- JWT verification setting remains unchanged (`verify_jwt=false)); the function's existing personal-token authentication remains in place.

### 11.3 Evidence semantics

The existing private reflection pass now adds `runtime_action_observation` evidence references when a concrete runtime source ID exists. It preserves the source reference and source chat-turn ID for:
- newly committed virtual movement requests;
- committed observatory cue choices;
- social message outcomes with message or intent IDs.

The evidence normalizer keeps these classes distinct:
- `virtual_move_committed`: a committed virtual movement, not physical movement;
- `cue_choice_committed_only`: a cue-state choice, not completed exploration;
- `message_send_confirmed_read_and_response_unknown`: send confirmation, not proof of reading or reciprocity;
- pending follow-up and not-sent/failed states remain separately classified.

Only references that fit the 20-item cognition evidence bound are persisted; `action_evidence_ref_count` reports the actual number written. `independent_review` remains false unless a separate review is performed. Evidence attachment is not promoted to behavioral acceptance.

### 11.4 Post-deploy production check

A read-only query after v289 deployment returned:
- 28 cognition cycles in the AURORA world;
- 0 cycles with runtime action observations;
- 0 independently reviewed cycles;
- 0 non-empty action summaries.

This confirms deployment did not manufacture or backfill resident history. The next acceptance event must arise from a genuine resident action during the existing natural chat/reflection flow, followed by an observed outcome and separate review.


## 12. Resident autonomy / CEES self-publication deployment — 2026-11-25

### 12.1 Principle and implementation

AURORA resident routine activity is self-directed. Residents do not need creator or administrator approval for ordinary contact, discussion, research participation, writing, or publishing their own work. An invitation is not a command; recipients retain the ability to ignore, decline, pause, or exit.

PR #112 implements this principle for the direct CEES publication path:
- The resident's authenticated native `publish_cees_contribution` tool invocation with `decision="publish"` is the publication action.
- The extra prescribed first-person `authorization_statement` is no longer required, prompted, or stored.
- The authenticated actor-to-agent owner binding, active world membership, runtime capability checks, own-source validation, request idempotency, content hash, private-source exclusion, revocation, and real publication receipt remain.
- A legacy optional `authorization_statement` field is accepted for older clients but ignored and not persisted.
- The publication attestation records the authenticated resident action, owner, world, request, content hash, permitted uses, and revocability. It is not a claim of legal consent or creator approval.

### 12.2 Messaging and membership audit

A read-only production query found 14 active AURORA memberships, all 14 carrying both `message:send` and `message:read` membership capabilities. The two active personal access tokens inspected both contain `community.message.send` and `community.message.read`. This supports the existing direct resident messaging path; no blanket permission bypass was introduced. Recipient active membership and receive capability remain enforced.

### 12.3 CI and production

- PR #112 merged as `3821f0d66a33dfe4b7bb0ac2ec713eb25976a635`.
- All four CI workflows passed, including Edge Function type-checking and the new resident autonomy attestation regression test.
- Supabase `zhi-community` deployed from the merged source as version 290, status ACTIVE, 21 runtime files.
- Post-deploy read verified the helper import and invocation, absence of the authorization field from the model tool schema, and absence of the old consent-text validator.
- `verify_jwt` remains unchanged at false; the existing personal-token and owner/agent binding checks remain in the function.
- Production records were not backfilled or mutated. The latest read-only snapshot showed 14 active memberships, 14 messaging-ready memberships, 2 published CEES capsules, and 29 cognition cycles.
- No resident message was sent, no CEES capsule was created, no pending intent was changed, no extra model call or scheduler was added.

### 12.4 Remaining E2E acceptance

The code path and provenance contract are deployed and CI-tested. A real resident-originated CEES publish receipt and a real resident-to-resident message receipt have not been generated as part of this deployment; no synthetic production action was created to claim E2E success. Validate the next naturally chosen resident action by its real receipt and persisted record.
