# Alice Legal Capability — ZHIMIA Runtime Integration Audit

Audit date: 2026-11-10
Environment inspected: connected ZHIMIA Supabase project and deployed `zhi-community` Edge Function.

## Verified existing runtime
- The connected Supabase project is named ZHIMIA, is ACTIVE_HEALTHY, runs PostgreSQL 17.11 and is hosted in ap-southeast-1.
- The deployed `zhi-community` Edge Function is active at version 98.
- Existing `world_resident` agents already receive the seven-brain and Super Brain guidance in the same system prompt and existing model invocation.
- The existing runtime has per-agent private cognition and experience structures, including `zhi_agent_cognition_records`, `zhi_agent_micro_experiences`, and `zhi_agent_chat_turns`.
- Existing table comments and foreign keys scope private cognition to the exact owner + agent pair. These records must not be repurposed as a shared public legal corpus.
- Alice's active agent record is a `world_resident`. Her current manifest marks memory scope as `owner_agent_private`, initial memory as empty, cross-agent memory access as false, and autonomy as supervised. Her existing personality configuration is to remain unchanged.

## Verified gap
- The public schema inventory contains no dedicated legal-source, legal-document, legal-version, case-citation or legal-ingestion tables.
- The database reports the pgvector extension as available, but it is not currently installed. Do not assume vector search is already configured.
- No evidence was found in this audit that Singapore legislation or court judgments have been ingested into ZHIMIA.
- The public manifest currently has no enabled `singapore_legal_intelligence` professional capability.
- The new legal prompt helper is source code on the feature branch only. It has not been deployed to the Edge Function and is not active for Alice.

## Integration decision
1. Keep the shared official legal corpus in a dedicated legal schema or equivalently isolated public-knowledge subsystem, separate from all private agent cognition and private chat tables.
2. Add only a bounded capability flag to Alice's public manifest after the runtime code is reviewed and deployed. Do not use display-name string matching as an authorization mechanism.
3. Inject the legal guidance only when the exact `professional_capabilities` array contains `singapore_legal_intelligence`. This is additive to the existing seven-brain/Super Brain prompt and does not create another model call.
4. Retrieval must use official source metadata and exact text/citation anchors first. Native PostgreSQL full-text search is the low-cost first milestone. Semantic vectors are optional and must not be enabled until model, dimensions, costs, access and data handling are reviewed.
5. Public legal sources may be shared as common knowledge; client matter files and privileged communications must remain in owner-scoped private workspaces and never be copied into shared knowledge or another resident's memory.

## Current delivery status
- Documentation and source registry: committed to feature branch.
- Domain coverage matrix: 36 legal domains recorded.
- Ingestion/retrieval architecture: specified.
- Alice legal guidance helper and tests: committed to feature branch.
- Runtime injection: committed to feature branch, awaiting CI/review.
- Production manifest flag: not enabled.
- Legal corpus schema and source ingestion: not implemented.
- Edge Function deployment: not performed.
- Production legal answer acceptance: not performed.

## Next safe implementation gates
A. Complete CI and review the feature branch.
B. Create the dedicated legal schema through the repository's normal Supabase CLI migration workflow in a development/test environment; do not directly alter production from this specification.
C. Implement a source registry, source/version tables, paragraph/section chunks, ingestion audit, and exact citation links with strict write permissions.
D. Add an admin-only source ingestion path after access terms are validated for each official source.
E. Add exact-match and full-text retrieval with temporal filters; test citations and historical versions.
F. Enable Alice's manifest capability only after the retrieval context is available and the safeguards pass.
G. Deploy and verify the real runtime; do not report production success based on code commits or CI alone.
