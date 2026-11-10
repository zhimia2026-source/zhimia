# Legal Corpus Data Model and Security Blueprint

Status: design only. This is not an applied database migration. No production schema has been changed.

## 1. Isolation boundary

Create a dedicated, non-exposed PostgreSQL schema named `legal`. It stores public legal materials and provenance only. It must not reference or copy rows from resident cognition, chat, micro-experience, identity, or private-memory tables.

The public corpus is not a case-management system. Client facts, pleadings, evidence, legal advice, privileged communications, personal identifiers and user-uploaded case files belong in a separately authorised private workspace, never in `legal`.

## 2. Logical entities

### `legal.sources`
One row per publisher/source endpoint:
- `id` UUID primary key
- `publisher`, `source_name`, `canonical_url`
- `source_class` (legislation, judgments, gazette, regulator, court_rules, secondary)
- `authority_class` (primary, official_guidance, secondary)
- `jurisdiction` default `SG`
- `access_method` (html, pdf, api, catalogue, manual)
- `terms_url`, `licence_status`, `bulk_access_status`, `rate_limit_notes`
- `permitted_storage`, `permitted_transformations`, `permitted_redistribution`
- `last_terms_checked_at`, `last_catalogue_checked_at`, `active`

A source is not ingestible until terms and access status are explicitly reviewed. Use enumerated statuses such as `UNVERIFIED`, `METADATA_ONLY`, `LIMITED`, `APPROVED`, `PROHIBITED`.

### `legal.documents`
Stable identity for a legal instrument, judgment or regulator publication:
- `id` UUID primary key; `source_id` FK
- `document_type`, `title`, `canonical_citation`, `jurisdiction`
- `court_or_issuer`, `court_level`, `neutral_citation`, `case_number`
- `domain_tags` text array
- `official_url`, `language`
- `legal_force` (binding, persuasive, guidance, explanatory, secondary, unknown)
- `document_status` (current, amended, repealed, revoked, withdrawn, historical, unknown)
- `created_at`, `updated_at`

### `legal.document_versions`
Immutable source/version snapshots:
- `id` UUID primary key; `document_id` FK; `source_id` FK
- `version_label`, `content_hash`, `mime_type`, `storage_locator` (nullable where content retention is not licensed)
- `published_at`, `made_or_enacted_at`, `commencement_date`
- `effective_from`, `effective_to`, `retrieved_at`, `verified_at`
- `verification_status`, `extraction_confidence`, `change_summary`
- `supersedes_version_id` nullable self-FK

For legislation, allow provision-specific commencement/effective dates; document-level dates alone are insufficient where commencement is staged.

### `legal.chunks`
Searchable, citation-anchored units:
- `id` UUID primary key; `version_id` FK
- `chunk_type` (section, subsection, schedule, paragraph, heading, table, summary)
- `locator` (e.g. section/subsection or judgment paragraph)
- `text_content` nullable if only metadata/link retention is permitted
- `content_hash`, `language`, `parse_status`, `confidence`
- `search_vector` tsvector with GIN index
- unique key on (`version_id`, `chunk_type`, `locator`, `content_hash`)

Do not create chunks from material whose storage or transformation rights are not approved. A metadata-only record may retain a citation and official link without copying text.

### `legal.citations`
Typed relationships between documents, versions, chunks and legal authorities:
- `id` UUID primary key
- `from_chunk_id` FK nullable; `from_document_id` FK
- `to_document_id` FK nullable; `to_version_id` FK nullable; `to_locator`
- `relationship` (cites, applies, follows, distinguishes, considers, doubts, overrules, reverses, amends, repeals, commences, enables)
- `treatment_status` (machine_candidate, human_verified, disputed, unknown)
- `supporting_locator`, `verified_at`, `verification_note`

Automated extraction may create only `machine_candidate` relationships. Do not represent overruled/reversed status as fact until independently verified.

### `legal.ingestion_runs`
Auditable execution records:
- `id` UUID primary key; `source_id` FK
- `started_at`, `finished_at`, `run_status`
- `catalogue_cursor`, `documents_seen`, `documents_changed`, `documents_skipped`, `errors` JSONB
- `terms_snapshot`, `runner_version`

### `legal.propositions` (later phase)
A proposition is a research aid, never an independent source of law:
- `id`, `proposition_text`, `jurisdiction`, `material_date`, `domain_tags`
- `supporting_chunk_ids`, `contrary_chunk_ids`
- `review_status`, `reviewed_at`, `reviewer_role`
- Require at least one supporting pinpoint and explicitly allow contrary authority.

## 3. Access model

- Keep schema `legal` out of Supabase's exposed schemas/Data API.
- Revoke schema/table privileges from `anon` and `authenticated`; do not grant broad client access.
- Grant read access only to the trusted server-side retrieval role/function that needs it.
- Grant writes only to a dedicated ingestion service role; never to resident clients.
- Use RLS as defence in depth if tables are later exposed or accessed through roles subject to RLS. Do not rely on RLS as a substitute for schema isolation and grants.
- Do not create `SECURITY DEFINER` functions for convenience. If one is later essential, keep it outside exposed schemas, explicitly check caller authority, narrowly grant EXECUTE and run security advisors.
- Every ingestion mutation must be attributable to a run and source. Preserve append-only version history; do not overwrite historical law.
- No resident identity or owner-agent key is needed on public corpus rows. That absence is deliberate.

## 4. Search design

Phase 1 uses native PostgreSQL full-text search and exact citation lookup:
1. exact citation/neutral citation/section/paragraph lookup;
2. jurisdiction + material-date + legal-status + authority filters;
3. PostgreSQL FTS ranking over permitted text;
4. return source/version/locator and provenance with every hit.

Do not install pgvector merely because it is available as an option. Embeddings are a later cost/security review, and must not replace exact legal citations or temporal filters.

## 5. Required invariants and tests

1. Public legal records contain no resident-private identifiers or case-file payloads.
2. `anon` and `authenticated` cannot read or write the `legal` schema.
3. The ingestion role can write only legal corpus tables and audit rows.
4. A resident's chat/memory role cannot query legal ingestion tables directly.
5. Historical versions remain queryable after amendments/repeal.
6. Provision-level commencement overrides document-level defaults where applicable.
7. A metadata-only source never yields copied full text.
8. Unverified citations and case-treatment edges are labelled, not promoted to verified authority.
9. Search results always include official source URL, exact locator, version/effective dates and verification status.
10. Deleting or changing a resident's private data cannot mutate public corpus rows, and corpus ingestion cannot mutate resident memory.

## 6. Migration and release sequence

1. Review this blueprint and confirm actual service-role identities/privilege model.
2. Create a Supabase development branch or isolated test database; avoid production iteration.
3. Generate the migration through the supported Supabase migration workflow (the CLI must create the migration file; do not invent a migration filename).
4. Apply to development only; run schema inspection, privilege tests, RLS/advisor checks and migration replay.
5. Add a retrieval endpoint with parameterised exact lookup and FTS; no model call inside the endpoint.
6. Seed only source metadata whose terms have been reviewed. Do not bulk-fetch content until source-specific permission is recorded.
7. Independently review test fixtures and answer citations.
8. Only after retrieval is live and tested should Alice's capability flag be enabled and the Edge Function deployed.

## 7. Current source caveats

- AGC describes Singapore Statutes Online as providing free online public access to Singapore legislation. That statement alone does not grant unrestricted bulk reproduction, redistribution or training rights; consult the SSO permission/FAQ route before copying or republishing material.
- Singapore Courts distinguishes published written judgments (with neutral citations) from brief reasons/grounds that are not intended for publication. Published Supreme Court decisions since 2000 and recent State Courts/Family Justice Courts decisions have different stated availability windows. Do not infer complete case coverage from the public catalogue.
- eLitigation is a court-service and cause-book channel, not a presumed public bulk judgment API.
- Independent legal indexes may assist discovery but must be labelled unofficial and must link back to the official judgment. Their own terms govern automated collection.

## 8. Explicit non-goals

This schema does not make Alice a practising lawyer, does not establish comprehensive coverage by itself, does not ingest private client matters, and does not authorise deployment or production schema changes.
