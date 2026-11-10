# Alice Legal Retrieval API Contract

Status: interface specification for the next implementation stage. No endpoint is deployed.

## 1. Purpose

Provide Alice's existing chat runtime with verifiable Singapore-law source material. Retrieval is a deterministic server-side operation; it does not call a language model. The caller remains responsible for reasoning over returned authorities and explaining uncertainty.

## 2. Request contract

A future internal endpoint should accept a validated JSON object:

- `query`: required string, bounded length.
- `jurisdiction`: defaults to `SG`; comparative jurisdictions must be explicit.
- `material_date`: optional ISO date describing when the relevant facts occurred; never silently default historical questions to today's law.
- `source_types`: optional allowlisted source classes.
- `domain_tags`: optional allowlisted legal domains.
- `exact_citation`: optional exact statute/case/section/neutral citation.
- `include_secondary`: false by default.
- `limit`: bounded server-side, e.g. 1–20.

Reject malformed dates, oversized queries, unknown filters and client-supplied SQL/order expressions. Use parameterised SQL only.

## 3. Retrieval stages

1. **Exact identifier path**: citation, neutral citation, Act/chapter, section/subsection and paragraph.
2. **Temporal resolution**: choose the version effective on `material_date`; where provision-level commencement is unknown, return `VERSION_UNRESOLVED` rather than guessing.
3. **Authority filter**: distinguish enacted law, binding/persuasive judgments, regulator directions/notices, official guidance and secondary commentary.
4. **Lexical retrieval**: PostgreSQL FTS over permitted indexed text, with exact phrase and citation boosts.
5. **Case-law treatment**: include verified later treatment and contrary authorities; candidate edges must remain labelled unverified.
6. **Coverage diagnostics**: disclose when a source catalogue is partial, access-restricted or not ingested.

Semantic/vector retrieval is deliberately excluded from phase 1. It may be added later only after a separate cost, privacy and citation-precision evaluation.

## 4. Response contract

Return a structured result with:

- `query_id`, `jurisdiction`, `material_date`, `generated_at`;
- `results[]`: document title, source class, authority class, legal force, court/issuer, canonical citation, official URL, exact locator, version label, effective dates, retrieved/verified timestamps, verification status, short excerpt if licensed, and relevance explanation;
- `treatment[]`: relationship type, target authority and verification status;
- `warnings[]`: incomplete coverage, missing text, unresolved temporal status, access restrictions, OCR/parse uncertainty, conflicting authorities;
- `coverage`: sources queried, sources unavailable, known catalogue gaps.

A result without an exact locator may be offered as a discovery lead, but must not be cited as pinpoint support for a legal proposition.

## 5. Failure statuses

Use stable machine-readable codes:
- `INVALID_REQUEST`
- `NO_MATCH`
- `SOURCE_UNAVAILABLE`
- `ACCESS_RESTRICTED`
- `TERMS_UNVERIFIED`
- `VERSION_UNRESOLVED`
- `CITATION_UNVERIFIED`
- `PARSE_LOW_CONFIDENCE`
- `CONFLICTING_AUTHORITIES`
- `PARTIAL_COVERAGE`
- `INTERNAL_ERROR`

A no-match response means no indexed match was found; it does not mean no law exists.

## 6. Runtime integration rules

- Call retrieval only when a legal research task is detected or the user explicitly asks for legal analysis.
- Do not add a separate model call to decide whether retrieval is needed; use existing request classification/handler flow.
- Inject only retrieved, bounded source excerpts and provenance into the existing model context.
- Never inject private matter data into public corpus search, and never copy retrieved public sources into Alice's autobiographical memory automatically.
- Distinguish source quotations from model analysis.
- If no primary authority is returned, state that primary authority was not verified and avoid definitive advice.
- High-stakes or fact-sensitive legal action requires referral to a Singapore-qualified practising lawyer.

## 7. Acceptance suite

### Exact law
Given a valid Act citation and section, retrieve the exact provision and official source URL; no invented wording.

### Material date
Given an amendment and a date before/after commencement, return the version in force on that date or explicitly mark unresolved.

### Judgment pinpoint
Given a neutral citation and paragraph number, return the correct judgment paragraph or a precise unavailable status.

### Precedent hierarchy
Distinguish Court of Appeal, High Court and lower-court decisions; foreign cases are labelled persuasive/comparative, not Singapore binding law.

### Case treatment
A later case's treatment is reported as verified only with a checked pinpoint supporting that relationship.

### Conflicting authority
Return materially contrary authorities and explain that the issue requires legal analysis; do not suppress them for a single confident answer.

### Guidance versus law
A regulator webpage or FAQ is not labelled an Act or binding judgment unless its legal status is independently established.

### No evidence
When retrieval finds no adequate authority, say so; do not hallucinate a case, section, date, quotation or citation.

### Privacy boundary
Attempted access from a resident client role to ingestion tables is denied; public corpus search reveals no other resident's private records.

## 8. Operational metrics

Track without storing sensitive query payloads unnecessarily:
- exact citation hit rate;
- temporal-version resolution rate;
- pinpoint validation pass rate;
- primary-source coverage by source catalogue denominator;
- parser/OCR confidence and error rate;
- stale-source detection latency;
- retrieval latency and cost;
- access-control denials and ingestion audit completeness.

Do not optimise for raw document count or answer confidence. Optimise for verifiable coverage and citation correctness.
